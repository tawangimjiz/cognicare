import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { extractZip, parseRepo, sha256File, validateManifest, writeZip } from './game-lib.mjs';
import { fetchGame, gameState } from './game-fetch.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gf-'));
const W = (dir, rel, data) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), data);
};
const BUILD = {
  'index.html': '<html>hi</html>',
  'TemplateData/a.css': 'a{}',
  'Build/x.loader.js': 'loader',
  'Build/x.framework.js': 'framework',
  'Build/x.data': Buffer.alloc(5000, 7),
  'Build/x.wasm': Buffer.from([0, 97, 115, 109, 1, 2, 3]),
};
const makeBuild = (dir) => Object.entries(BUILD).forEach(([r, d]) => W(dir, r, d));

/** Raw zip with arbitrary entry names/attrs (stored), to test the reader against hostile archives. */
function rawZip(file, entries) {
  const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
  const parts = [];
  const cen = [];
  let pos = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const data = Buffer.from(e.data ?? 'x');
    const f = [u16(20), u16(0), u16(0), u16(0), u16(0), u32(zlib.crc32(data)), u32(data.length), u32(data.length), u16(name.length), u16(0)];
    cen.push(Buffer.concat([u32(0x02014b50), u16(e.madeBy ?? 20), ...f, u16(0), u16(0), u16(0), u32(e.extAttr ?? 0), u32(pos), name]));
    const lh = Buffer.concat([u32(0x04034b50), ...f, name, data]);
    parts.push(lh);
    pos += lh.length;
  }
  const cd = Buffer.concat(cen);
  fs.writeFileSync(file, Buffer.concat([...parts, cd, u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(cd.length), u32(pos), u16(0)]));
}

test('zip build/extract roundtrip preserves every file byte-for-byte', () => {
  const src = tmpdir(), out = tmpdir();
  makeBuild(src);
  const z = path.join(src, '..', path.basename(src) + '.zip');
  writeZip(z, src, Object.keys(BUILD));
  const names = extractZip(z, out);
  assert.deepEqual(names.sort(), Object.keys(BUILD).sort());
  for (const [r, d] of Object.entries(BUILD)) assert.deepEqual(fs.readFileSync(path.join(out, r)), Buffer.from(d));
});

test('zip is deterministic', () => {
  const src = tmpdir();
  makeBuild(src);
  const a = path.join(src, 'a.zip.out'), b = path.join(src, 'b.zip.out');
  writeZip(a, src, Object.keys(BUILD));
  writeZip(b, src, [...Object.keys(BUILD)].reverse());
  assert.equal(sha256File(a), sha256File(b));
});

test('extract rejects zip-slip, absolute, symlink, disallowed and duplicate entries', () => {
  const d = tmpdir();
  const bad = [
    [{ name: '../evil.txt' }],
    [{ name: 'Build/../../evil.txt' }],
    [{ name: '/etc/passwd' }],
    [{ name: 'C:/x/index.html' }],
    [{ name: 'Build\\..\\x' }],
    [{ name: 'index.html' }, { name: 'Build/link', madeBy: (3 << 8) | 20, extAttr: (0o120777 << 16) >>> 0 }],
    [{ name: 'other/file.txt' }],
    [{ name: 'Build/' }],
    [{ name: 'index.html' }, { name: 'INDEX.HTML' }],
    [{ name: 'Build/a\0b' }],
    [{ name: 'Build/a:stream' }],
    [{ name: 'Build/a.wasm.' }],
    [{ name: 'TemplateData/con.css' }],
  ];
  bad.forEach((entries, i) => {
    const z = path.join(d, `bad${i}.zip`);
    rawZip(z, entries);
    const out = path.join(d, `out${i}`);
    fs.mkdirSync(out);
    assert.throws(() => extractZip(z, out), /unsafe zip/, JSON.stringify(entries.map((e) => e.name)));
    assert.deepEqual(fs.readdirSync(out), [], 'nothing extracted');
  });
  assert.equal(fs.existsSync(path.join(d, 'evil.txt')), false);
});

test('listZip rejects zip64 markers and entry data beyond the central directory (no huge allocation)', () => {
  const d = tmpdir();
  const z = path.join(d, 'z.zip');
  rawZip(z, [{ name: 'index.html' }]);
  const b = fs.readFileSync(z);
  const cen = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  for (const [off, val, re] of [[20, 0xffffffff, /zip64/], [20, 0x7ffffff0, /out of range/], [42, 0xffffffff, /zip64/]]) {
    const c = Buffer.from(b);
    c.writeUInt32LE(val, cen + off);
    fs.writeFileSync(z, c);
    assert.throws(() => extractZip(z, tmpdir()), re);
  }
});

test('writeZip refuses names the reader would reject', () => {
  const src = tmpdir();
  makeBuild(src);
  assert.throws(() => writeZip(path.join(src, 'o.zip.out'), src, [...Object.keys(BUILD), 'Build/a:b']), /not portable/);
});

test('validateManifest', () => {
  const v = 'abcdef012345';
  const ok = { version: v, publishedAt: new Date().toISOString(), tag: `game-oneback-${v}`, asset: `oneback-${v}.zip`, sha256: 'a'.repeat(64), bytes: 10 };
  assert.equal(validateManifest(ok, 'oneback'), ok);
  for (const patch of [{ version: 'xyz' }, { tag: 'game-maze-' + v }, { asset: 'x.zip' }, { sha256: '' }, { bytes: 0 }, { bytes: 1.5 }, { publishedAt: 'nope' }])
    assert.throws(() => validateManifest({ ...ok, ...patch }, 'oneback'), /invalid oneback\/version\.json/);
  assert.throws(() => validateManifest({ version: v, publishedAt: ok.publishedAt }, 'oneback')); // legacy manifest w/o zip info
  assert.throws(() => validateManifest(null, 'oneback'));
});

test('parseRepo', () => {
  assert.equal(parseRepo('https://github.com/o/r.git'), 'o/r');
  assert.equal(parseRepo('git@github.com:o/r.git'), 'o/r');
  assert.equal(parseRepo('https://example.com/o/r'), null);
});

/** Scratch repo root: publish a synthetic build into it with the real CLI, then serve dist-games over HTTP. */
async function scratch() {
  const root = tmpdir(), src = tmpdir();
  fs.mkdirSync(path.join(root, 'apps/web/public/games'), { recursive: true });
  makeBuild(src);
  const r = spawnSync(process.execPath, [path.join(here, 'game-publish.mjs'), 'oneback', src], { env: { ...process.env, GAME_ROOT: root }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /gh release create game-oneback-[0-9a-f]{12} /); // no --release: prints the command only
  const gamesDir = path.join(root, 'apps/web/public/games');
  const manifest = JSON.parse(fs.readFileSync(path.join(gamesDir, 'oneback/version.json'), 'utf8'));
  validateManifest(manifest, 'oneback');
  const dist = path.join(root, 'dist-games');
  const hits = [];
  let body = null; // override served bytes
  const server = http.createServer((req, res) => {
    hits.push(req.url);
    const f = path.join(dist, path.basename(req.url));
    if (req.url !== `/${manifest.tag}/${manifest.asset}` || !fs.existsSync(f)) return res.writeHead(404).end();
    res.writeHead(200).end(body ?? fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const env = { GAME_ASSET_BASE_URL: `http://127.0.0.1:${server.address().port}`, GAME_FETCH_TOKEN: '' };
  const clearBuild = () => ['Build', 'TemplateData', 'index.html', '.fetched-version'].forEach((n) => fs.rmSync(path.join(gamesDir, 'oneback', n), { recursive: true, force: true }));
  return { gamesDir, manifest, dist, hits, env, server, clearBuild, setBody: (b) => (body = b), repo: 'o/r', log: () => {} };
}

test('publish -> serve -> fetch roundtrip; then up-to-date is skipped without network', async () => {
  const s = await scratch();
  try {
    assert.equal(gameState(s.gamesDir, 'oneback').state, 'current'); // publish marks its own tree as fetched
    s.clearBuild();
    assert.equal(gameState(s.gamesDir, 'oneback').state, 'missing');
    assert.equal(await fetchGame({ ...s, id: 'oneback' }), 'fetched');
    for (const [r, d] of Object.entries(BUILD)) assert.deepEqual(fs.readFileSync(path.join(s.gamesDir, 'oneback', r), null), Buffer.from(d));
    assert.equal(fs.readFileSync(path.join(s.gamesDir, 'oneback/.fetched-version'), 'utf8'), s.manifest.version);
    assert.equal(s.hits.length, 1);
    assert.equal(await fetchGame({ ...s, id: 'oneback' }), 'skipped');
    assert.equal(s.hits.length, 1, 'no second download');
    assert.deepEqual(fs.readdirSync(s.gamesDir).filter((n) => n.startsWith('.fetch-')), [], 'temp dir cleaned');
  } finally {
    s.server.close();
  }
});

test('fetch fails closed on sha256 mismatch and leaves the old tree untouched', async () => {
  const s = await scratch();
  try {
    fs.writeFileSync(path.join(s.gamesDir, 'oneback/.fetched-version'), 'old'); // outdated
    const idx = path.join(s.gamesDir, 'oneback/index.html');
    const before = fs.readFileSync(idx);
    const zip = fs.readFileSync(path.join(s.dist, s.manifest.asset));
    const evil = Buffer.from(zip);
    evil[evil.length >> 1] ^= 0xff; // same length, different content
    s.setBody(evil);
    await assert.rejects(fetchGame({ ...s, id: 'oneback' }), /sha256 mismatch/);
    s.setBody(zip.subarray(0, zip.length - 1));
    await assert.rejects(fetchGame({ ...s, id: 'oneback' }), /size mismatch/);
    assert.deepEqual(fs.readFileSync(idx), before);
    assert.equal(gameState(s.gamesDir, 'oneback').state, 'outdated');
  } finally {
    s.server.close();
  }
});

test('fetch reports a clear error when the release is missing', async () => {
  const s = await scratch();
  try {
    fs.rmSync(path.join(s.dist, s.manifest.asset));
    s.clearBuild();
    await assert.rejects(fetchGame({ ...s, id: 'oneback' }), /not found in o\/r.*Was it uploaded/);
  } finally {
    s.server.close();
  }
});

test('game with no manifest is skipped; invalid manifest throws', async () => {
  const d = tmpdir();
  assert.equal(await fetchGame({ gamesDir: d, id: 'maze', repo: 'o/r' }), 'skipped');
  W(d, 'maze/version.json', JSON.stringify({ version: 'abcdef012345', publishedAt: new Date().toISOString() }));
  await assert.rejects(fetchGame({ gamesDir: d, id: 'maze', repo: 'o/r' }), /invalid maze\/version\.json/);
});

test('publish rejects unknown flags', () => {
  const r = spawnSync(process.execPath, [path.join(here, 'game-publish.mjs'), 'oneback', '.', '--nope'], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage/);
});
