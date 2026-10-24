// Publish a Unity WebGL build into apps/web/public/games/<id>/.
// Usage: npm run game:publish -- <spot|oneback|maze> <unity-build-dir> [--dry-run] [--release]
// Installs the build locally, writes dist-games/<id>-<version>.zip and the committed manifest version.json.
// --release also uploads the zip as GitHub release game-<id>-<version> (opt-in; needs an authenticated gh).
// Env GAME_ROOT overrides the repo root (tests).
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_REPO, MAX_ASSET_BYTES, gameAsset, gameTag, originRepo, sha256File, swapIn, writeZip } from './game-lib.mjs';

// ponytail: constant mirrors GAMES in packages/shared/src/domain.ts (shared needs a build before it is importable).
export const GAME_IDS = ['spot', 'oneback', 'maze'];
export const WARN_BYTES = 500 * 1024 * 1024;
export const FAIL_BYTES = MAX_ASSET_BYTES; // GitHub release asset limit
const COMPRESSED = /\.(br|gz|unityweb)$/i;
const KINDS = ['loader', 'framework', 'data', 'wasm'];

/** files: relative posix paths of the source dir. Returns { errors, compressed }. */
export function validateSource(files) {
  const errors = [];
  if (!files.includes('index.html')) errors.push('missing index.html');
  const build = files.filter((f) => f.startsWith('Build/'));
  if (!build.length) errors.push('missing Build/ (or it is empty)');
  if (!files.some((f) => f.startsWith('TemplateData/'))) errors.push('missing TemplateData/ (or it is empty)');
  for (const k of KINDS) {
    const re = new RegExp(`\\.${k}(\\.js)?(\\.(br|gz|unityweb))?$`, 'i');
    if (build.length && !build.some((f) => re.test(f))) errors.push(`Build/ has no ${k} file`);
  }
  return { errors, compressed: build.filter((f) => COMPRESSED.test(f)) };
}

/** entries: [{ rel, content: Buffer }] -> first 12 hex of sha256 over Build files + index.html (sorted by path). */
export function versionHash(entries) {
  const h = createHash('sha256');
  const used = entries.filter((e) => e.rel === 'index.html' || e.rel.startsWith('Build/')).sort((a, b) => (a.rel < b.rel ? -1 : 1));
  for (const e of used) h.update(e.rel + '\0').update(e.content).update('\0');
  return h.digest('hex').slice(0, 12);
}

/** sizes: [{ rel, size }]. */
export function sizePolicy(sizes) {
  const warnings = [];
  const errors = [];
  for (const { rel, size } of sizes) {
    const mb = (size / 1048576).toFixed(1);
    if (size > FAIL_BYTES) errors.push(`${rel} is ${mb} MB (> 2 GB GitHub release asset limit)`);
    else if (size > WARN_BYTES) warnings.push(`${rel} is ${mb} MB (> 500 MB)`);
  }
  return { warnings, errors };
}

function walk(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (!d.isDirectory() && !d.isFile()) throw new Error(`refusing symlink/junction/special file in build: ${p}`);
    return d.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

const inside = (parent, child) => {
  const r = path.relative(parent, child);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'));
  const flags = argv.filter((a) => a.startsWith('--'));
  const dry = flags.includes('--dry-run');
  const release = flags.includes('--release');
  const [id, srcArg] = args;
  const fail = (m) => {
    console.error(`ERROR: ${m}`);
    process.exit(1);
  };
  if (args.length !== 2 || !GAME_IDS.includes(id) || flags.some((f) => f !== '--dry-run' && f !== '--release'))
    fail(`usage: npm run game:publish -- <${GAME_IDS.join('|')}> <unity-build-dir> [--dry-run] [--release]`);
  if (dry && release) fail('--dry-run and --release cannot be combined');
  const repo = fs.realpathSync(process.env.GAME_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const gamesDir = fs.realpathSync(path.join(repo, 'apps/web/public/games'));
  const dest = path.join(gamesDir, id);
  const destReal = fs.existsSync(dest) ? fs.realpathSync(dest) : dest;
  if (!inside(repo, destReal)) fail(`destination escapes the repo: ${destReal}`);
  if (!fs.existsSync(srcArg) || !fs.statSync(srcArg).isDirectory()) fail(`source is not a directory: ${srcArg}`);
  const src = fs.realpathSync(srcArg);
  if (inside(destReal, src) || inside(src, destReal)) fail(`source and destination overlap (${src} vs ${destReal}); publish from a separate build directory`);

  let files;
  try {
    files = walk(src);
  } catch (e) {
    fail(e.message);
  }
  const { errors, compressed } = validateSource(files);
  if (errors.length) fail(`invalid Unity build:\n  - ${errors.join('\n  - ')}`);
  const copy = files.filter((f) => f === 'index.html' || f.startsWith('Build/') || f.startsWith('TemplateData/'));
  const ignored = [...new Set(files.filter((f) => !copy.includes(f)).map((f) => f.split('/')[0]))];
  if (ignored.length) console.warn(`note: ignoring top-level entries: ${ignored.join(', ')}`);

  if (compressed.length) {
    // Unity writes this marker into builds made with Decompression Fallback: the loader inflates them in JS
    const fallback = compressed.every((f) => {
      const fd = fs.openSync(path.join(src, f), 'r');
      const buf = Buffer.alloc(256);
      fs.readSync(fd, buf, 0, 256, 0);
      fs.closeSync(fd);
      return buf.includes('UnityWeb Compressed Content');
    });
    console.warn(`\n!!! ${fallback ? 'NOTE: DECOMPRESSION FALLBACK BUILD' : 'WARNING: COMPRESSED BUILD FILES DETECTED'} !!!`);
    console.warn(compressed.map((f) => `    ${f}`).join('\n'));
    if (fallback) {
      console.warn('Loads without Content-Encoding but starts slower (JS decompression). Never serve it with "Content-Encoding: br" over plain HTTP.');
    } else {
      console.warn('Next.js does not send Content-Encoding for .br/.gz/.unityweb, so the game will fail to load.');
      console.warn('In Unity: Player Settings > Publishing Settings > Compression Format = Disabled, then rebuild.\n');
    }
  }

  const sizes = copy.map((rel) => ({ rel, size: fs.statSync(path.join(src, rel)).size }));
  for (const s of sizes) console.log(`${(s.size / 1048576).toFixed(2).padStart(9)} MB  ${s.rel}`);
  console.log(`${(sizes.reduce((a, s) => a + s.size, 0) / 1048576).toFixed(2).padStart(9)} MB  TOTAL (${sizes.length} files)`);
  const policy = sizePolicy(sizes);
  policy.warnings.forEach((w) => console.warn(`WARNING: ${w}`));
  if (policy.errors.length) fail(policy.errors.join('\n') + '\nShrink the build.');

  const hashed = copy.filter((r) => r === 'index.html' || r.startsWith('Build/'));
  const version = versionHash(hashed.map((rel) => ({ rel, content: fs.readFileSync(path.join(src, rel)) })));
  if (dry) return console.log(`\n[dry-run] would publish ${id} -> ${dest}, version ${version}. Nothing written.`);

  fs.mkdirSync(dest, { recursive: true });
  const distDir = path.join(repo, 'dist-games');
  fs.mkdirSync(distDir, { recursive: true });
  const asset = gameAsset(id, version);
  const zipPath = path.join(distDir, asset);
  const tmp = fs.mkdtempSync(path.join(gamesDir, '.publish-'));
  let manifest;
  try {
    for (const rel of copy) {
      fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
      fs.copyFileSync(path.join(src, rel), path.join(tmp, rel));
    }
    // zip first: a failure here leaves public/games/<id> untouched
    const zipTmp = path.join(tmp, '.zip');
    writeZip(zipTmp, tmp, copy);
    const bytes = fs.statSync(zipTmp).size;
    if (bytes > MAX_ASSET_BYTES) throw new Error(`${asset} is ${(bytes / 1048576).toFixed(1)} MB (> 2 GB GitHub release asset limit)`);
    manifest = { version, publishedAt: new Date().toISOString(), tag: gameTag(id, version), asset, sha256: sha256File(zipTmp), bytes };
    fs.writeFileSync(path.join(tmp, 'version.json'), JSON.stringify(manifest, null, 2) + '\n');
    fs.writeFileSync(path.join(tmp, '.fetched-version'), version); // this tree already is that version: game:fetch skips it
    fs.renameSync(zipTmp, zipPath); // before the swap: a manifest must never be installed without its zip
    // Swap by rename only (deleting in place can half-delete Build/ when a file is locked on Windows); rolls back on failure.
    swapIn(tmp, dest, ['Build', 'TemplateData', 'index.html', 'version.json', '.fetched-version']);
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (e) {
      console.warn(`WARNING: could not remove ${tmp} (${e.code}); delete it manually`);
    }
  }
  console.log(`\nPublished ${id} version ${version} -> ${dest}`);
  console.log(`Zip: ${zipPath} (${manifest.bytes} bytes, sha256 ${manifest.sha256})`);
  releaseStep(repo, manifest, zipPath, release, fail);
}

function releaseStep(repo, m, zipPath, doRelease, fail) {
  const slug = process.env.GAME_RELEASE_REPO || EXPECTED_REPO;
  const notes = `CogniCare Unity WebGL build ${m.version} (sha256 ${m.sha256})`;
  if (!doRelease) {
    console.log(`\nNot uploaded. To upload the release asset, run:\n  gh release create ${m.tag} "${zipPath}" --repo ${slug} --title "${m.tag}" --notes "${notes}"\n(or re-run with --release). Then commit only the game's version.json.`);
    return;
  }
  const gh = (a) => spawnSync('gh', a, { encoding: 'utf8' });
  if (gh(['auth', 'status']).status !== 0) fail('--release needs an authenticated gh (run: gh auth login)');
  const origin = originRepo(repo);
  if (origin !== slug) fail(`origin remote is ${origin ?? 'not a GitHub repo'}, expected ${slug} (set GAME_RELEASE_REPO to override); refusing to release`);
  const exists = gh(['release', 'view', m.tag, '--repo', slug]).status === 0;
  const args = exists
    ? ['release', 'upload', m.tag, zipPath, '--clobber', '--repo', slug]
    : ['release', 'create', m.tag, zipPath, '--repo', slug, '--title', m.tag, '--notes', notes];
  const r = spawnSync('gh', args, { stdio: 'inherit' });
  if (r.status !== 0) fail(`gh release ${args[1]} failed (exit ${r.status})`);
  console.log(`Release: https://github.com/${slug}/releases/tag/${m.tag}`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
