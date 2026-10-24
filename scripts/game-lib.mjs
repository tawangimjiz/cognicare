// Shared by game-publish.mjs and game-fetch.mjs: minimal zip writer/reader, manifest validation, repo helpers.
// Zip is hand-rolled on node:zlib on purpose: no zip/tar dependency is installed, `tar`/Compress-Archive differ per OS/CI image,
// and we need a reader that rejects zip-slip/symlinks itself. shortcut: no zip64, so a zip or entry must stay under 4 GiB
// (GitHub's release-asset limit is 2 GiB anyway).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const EXPECTED_REPO = 'tawangimjiz/cognicare';
export const ALLOWED_TOP = ['index.html', 'Build', 'TemplateData'];
export const MAX_ASSET_BYTES = 2 * 1024 ** 3; // GitHub release asset hard limit

export const gameTag = (id, version) => `game-${id}-${version}`;
export const gameAsset = (id, version) => `${id}-${version}.zip`;

/** Throws a descriptive Error unless obj is a complete manifest for game id. Returns obj. */
export function validateManifest(obj, id) {
  const bad = (m) => {
    throw new Error(`invalid ${id}/version.json: ${m}`);
  };
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) bad('not an object');
  if (typeof obj.version !== 'string' || !/^[0-9a-f]{12}$/.test(obj.version)) bad('version must be 12 hex chars');
  if (typeof obj.publishedAt !== 'string' || Number.isNaN(Date.parse(obj.publishedAt))) bad('publishedAt must be an ISO date');
  if (obj.tag !== gameTag(id, obj.version)) bad(`tag must be ${gameTag(id, obj.version)}`);
  if (obj.asset !== gameAsset(id, obj.version)) bad(`asset must be ${gameAsset(id, obj.version)}`);
  if (typeof obj.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(obj.sha256)) bad('sha256 must be 64 hex chars (re-run game:publish to build the zip)');
  if (!Number.isSafeInteger(obj.bytes) || obj.bytes <= 0 || obj.bytes > MAX_ASSET_BYTES) bad('bytes must be an integer in 1..2 GiB');
  return obj;
}

/** owner/repo from an https or ssh GitHub remote URL, else null. */
export function parseRepo(url) {
  const m = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(String(url).trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

export function originRepo(cwd) {
  try {
    return parseRepo(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}

export function sha256File(file) {
  const h = createHash('sha256');
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(1 << 20);
    for (let n; (n = fs.readSync(fd, buf, 0, buf.length, null)) > 0; ) h.update(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

/** Atomic-ish swap: move dest/<names> into <tmp>/.old, move tmp/<names> into dest; roll back on failure. */
export function swapIn(tmp, dest, names) {
  fs.mkdirSync(dest, { recursive: true });
  const old = path.join(tmp, '.old');
  fs.mkdirSync(old);
  const moved = [];
  const placed = [];
  try {
    for (const n of names) {
      if (!fs.existsSync(path.join(dest, n))) continue;
      fs.renameSync(path.join(dest, n), path.join(old, n));
      moved.push(n);
    }
    for (const n of names) {
      fs.renameSync(path.join(tmp, n), path.join(dest, n));
      placed.push(n);
    }
  } catch (e) {
    for (const n of placed) fs.renameSync(path.join(dest, n), path.join(tmp, n));
    for (const n of moved) fs.renameSync(path.join(old, n), path.join(dest, n));
    throw e;
  }
}

const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const DOS_DATE = (1 << 5) | 1; // 1980-01-01, fixed so the zip is deterministic

/** Writes baseDir/<rels> into zipPath (rels: posix relative paths). Deterministic for identical input. */
export function writeZip(zipPath, baseDir, rels) {
  const fd = fs.openSync(zipPath, 'w');
  let pos = 0;
  const out = (...bufs) => {
    for (const b of bufs) { fs.writeSync(fd, b); pos += b.length; }
  };
  const central = [];
  const seen = new Set();
  try {
    for (const rel of [...rels].sort()) {
      checkName(rel); // never write what extractZip would reject
      if (seen.has(rel.toLowerCase())) throw new Error(`case-insensitive duplicate path in build: ${rel}`);
      seen.add(rel.toLowerCase());
      const data = fs.readFileSync(path.join(baseDir, rel));
      const name = Buffer.from(rel, 'utf8');
      let body = zlib.deflateRawSync(data);
      let method = 8;
      if (body.length >= data.length) { body = data; method = 0; }
      if (pos >= 0xffffffff || data.length >= 0xffffffff) throw new Error(`zip too large (no zip64 support): ${rel}`);
      const crc = zlib.crc32(data);
      const common = [u16(20), u16(0x0800), u16(method), u16(0), u16(DOS_DATE), u32(crc), u32(body.length), u32(data.length), u16(name.length), u16(0)];
      central.push({ name, common, offset: pos });
      out(u32(0x04034b50), ...common, name, body);
    }
    const cdStart = pos;
    // after namelen: extralen, commentlen, disk, intattr (u16 each), extattr, offset, name
    for (const c of central) {
      out(u32(0x02014b50), u16(20), ...c.common.slice(0, 9), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset), c.name);
    }
    out(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(pos - cdStart), u32(cdStart), u16(0));
  } finally {
    fs.closeSync(fd);
  }
}

/** Parses the central directory. Returns entry list; throws on malformed/zip64/multi-disk archives. */
export function listZip(zipPath) {
  const fd = fs.openSync(zipPath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const tailLen = Math.min(size, 65557);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    // the real EOCD is the one whose comment ends exactly at EOF (a comment may itself contain the signature)
    let e = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    while (e >= 0 && (e + 22 > tailLen || e + 22 + tail.readUInt16LE(e + 20) !== tailLen)) e = e > 0 ? tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]), e - 1) : -1;
    if (e < 0) throw new Error('not a zip file (no end-of-central-directory)');
    const count = tail.readUInt16LE(e + 10);
    const cdSize = tail.readUInt32LE(e + 12);
    const cdOff = tail.readUInt32LE(e + 16);
    if (tail.readUInt16LE(e + 4) !== 0 || count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) throw new Error('unsupported zip (multi-disk or zip64)');
    if (cdOff + cdSize > size) throw new Error('corrupt zip (central directory out of range)');
    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOff);
    const entries = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > cd.length || cd.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt zip (bad central header)');
      const nameLen = cd.readUInt16LE(p + 28);
      const skip = nameLen + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32);
      if (p + 46 + skip > cd.length) throw new Error('corrupt zip (central header overflows)');
      const en = {
        name: cd.toString('utf8', p + 46, p + 46 + nameLen),
        madeBy: cd.readUInt16LE(p + 4),
        flags: cd.readUInt16LE(p + 8),
        method: cd.readUInt16LE(p + 10),
        crc: cd.readUInt32LE(p + 16),
        csize: cd.readUInt32LE(p + 20),
        usize: cd.readUInt32LE(p + 24),
        extAttr: cd.readUInt32LE(p + 38),
        offset: cd.readUInt32LE(p + 42),
      };
      if (en.csize === 0xffffffff || en.usize === 0xffffffff || en.offset === 0xffffffff) throw new Error('unsupported zip (zip64 entry)');
      // entry data must lie before the central directory: bounds the read buffer by the real file size
      if (en.offset + 30 + en.csize > cdOff) throw new Error(`corrupt zip (entry data out of range): ${en.name}`);
      entries.push(en);
      p += 46 + skip;
    }
    return entries;
  } finally {
    fs.closeSync(fd);
  }
}

/** Throws unless n is a safe relative posix path that extracts to the same file on Windows, macOS and Linux. */
export function checkName(n) {
  const fail = (why) => { throw new Error(`unsafe zip entry ${JSON.stringify(n)}: ${why}`); };
  if (!n || n.endsWith('/')) fail('directory entries are not allowed');
  if (n.includes('\\') || n.includes('\0') || n.startsWith('/') || /^[a-zA-Z]:/.test(n)) fail('absolute or non-posix path');
  const parts = n.split('/');
  if (parts.some((s) => s === '' || s === '.' || s === '..')) fail('path traversal');
  // Windows strips trailing dots/spaces, treats ':' as a stream separator and reserves device names
  if (parts.some((s) => /[\x00-\x1f<>:"|?*]|[. ]$/.test(s) || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s))) fail('name not portable to Windows');
  if (!ALLOWED_TOP.includes(parts[0])) fail(`top-level must be one of ${ALLOWED_TOP.join(', ')}`);
  if (parts[0] === 'index.html' && parts.length !== 1) fail('index.html must be a file');
  if (parts[0] !== 'index.html' && parts.length < 2) fail('Build/TemplateData must be directories');
}

/** Throws unless the entry is a plain file with a safe, allowed relative path. */
export function checkEntry(en) {
  const n = en.name;
  const fail = (why) => { throw new Error(`unsafe zip entry ${JSON.stringify(n)}: ${why}`); };
  checkName(n);
  if (en.flags & 0x41) fail('encrypted');
  if (en.method !== 0 && en.method !== 8) fail(`unsupported compression method ${en.method}`);
  const hostUnix = en.madeBy >> 8 === 3;
  const mode = en.extAttr >>> 16;
  if (hostUnix && (mode & 0xf000) !== 0 && (mode & 0xf000) !== 0x8000) fail('symlink or special file');
  if (en.extAttr & 0x10) fail('directory attribute');
}

/** Validates then extracts every entry of zipPath into the EMPTY dir destDir; verifies sizes and CRC. Returns relative names. */
export function extractZip(zipPath, destDir) {
  const entries = listZip(zipPath);
  const seen = new Set();
  let total = 0;
  for (const en of entries) {
    checkEntry(en);
    if (seen.has(en.name.toLowerCase())) throw new Error(`unsafe zip: duplicate entry ${JSON.stringify(en.name)}`);
    seen.add(en.name.toLowerCase());
    total += en.usize;
  }
  if (total > 4 * 1024 ** 3) throw new Error('unsafe zip: declared size over 4 GiB');
  const root = path.resolve(destDir);
  const fd = fs.openSync(zipPath, 'r');
  try {
    for (const en of entries) {
      const lh = Buffer.alloc(30);
      fs.readSync(fd, lh, 0, 30, en.offset);
      if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error(`corrupt zip: bad local header for ${en.name}`);
      const dataStart = en.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
      const raw = Buffer.alloc(en.csize);
      if (fs.readSync(fd, raw, 0, en.csize, dataStart) !== en.csize) throw new Error(`corrupt zip: truncated ${en.name}`);
      const data = en.method === 8 ? zlib.inflateRawSync(raw, { maxOutputLength: Math.max(en.usize, 1) }) : raw;
      if (data.length !== en.usize || zlib.crc32(data) !== en.crc) throw new Error(`corrupt zip: size/CRC mismatch for ${en.name}`);
      const target = path.resolve(root, ...en.name.split('/'));
      if (!target.startsWith(root + path.sep)) throw new Error(`unsafe zip entry ${JSON.stringify(en.name)}: escapes target`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data, { flag: 'wx' });
    }
  } finally {
    fs.closeSync(fd);
  }
  return entries.map((e) => e.name);
}
