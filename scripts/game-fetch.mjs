// Download Unity WebGL builds from GitHub release assets into apps/web/public/games/<id>/.
// Usage: npm run game:fetch [-- --check]
// For every game with a committed version.json manifest whose build is missing/outdated: download <asset> of release <tag>,
// verify size + sha256 (fail closed), extract safely, swap into place.
// Env: GAME_RELEASE_REPO (owner/repo, default: origin remote), GAME_FETCH_TOKEN (private repos), GAME_ASSET_BASE_URL (tests),
//      GAME_ROOT (tests, overrides repo root).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { EXPECTED_REPO, extractZip, originRepo, sha256File, swapIn, validateManifest } from './game-lib.mjs';
import { GAME_IDS, validateSource } from './game-publish.mjs';

export class ReleaseMissing extends Error {}

/** Manifest for game id, or null when it has none. Throws on an invalid manifest. */
export function readManifest(gamesDir, id) {
  const f = path.join(gamesDir, id, 'version.json');
  if (!fs.existsSync(f)) return null;
  let j;
  try {
    j = JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch (e) {
    throw new Error(`invalid ${id}/version.json: ${e.message}`);
  }
  return validateManifest(j, id);
}

/** 'none' (no manifest) | 'current' | 'missing' (no index.html) | 'outdated' (other/unknown version). Needs no network. */
export function gameState(gamesDir, id) {
  const m = readManifest(gamesDir, id);
  if (!m) return { state: 'none' };
  const dir = path.join(gamesDir, id);
  if (!fs.existsSync(path.join(dir, 'index.html'))) return { state: 'missing', manifest: m };
  let have = null;
  try {
    have = fs.readFileSync(path.join(dir, '.fetched-version'), 'utf8').trim();
  } catch {}
  return { state: have === m.version ? 'current' : 'outdated', manifest: m };
}

async function httpDownload(url, headers, dest, maxBytes) {
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (res.status === 404) throw new ReleaseMissing(`HTTP 404 for ${url}`);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  let n = 0;
  await pipeline(
    Readable.fromWeb(res.body),
    async function* (src) {
      for await (const c of src) {
        n += c.length;
        if (n > maxBytes) throw new Error(`download exceeds manifest size (${maxBytes} bytes); aborted`);
        yield c;
      }
    },
    fs.createWriteStream(dest),
  );
}

async function download(m, repo, env, dest, log) {
  const errors = [];
  const base = env.GAME_ASSET_BASE_URL;
  const token = env.GAME_FETCH_TOKEN;
  if (!base && spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' }).status === 0) {
    const dir = path.dirname(dest);
    const r = spawnSync('gh', ['release', 'download', m.tag, '--repo', repo, '--pattern', m.asset, '--dir', dir, '--clobber'], { encoding: 'utf8' });
    if (r.status === 0 && fs.existsSync(path.join(dir, m.asset))) {
      fs.renameSync(path.join(dir, m.asset), dest);
      return;
    }
    errors.push(`gh release download failed: ${(r.stderr || '').trim().split('\n').pop()}`);
    log(`gh failed, falling back to HTTP download`);
  }
  try {
    if (token && !base) {
      // Private repo: github.com download URLs ignore bearer tokens; go through the API asset endpoint (auth is dropped on the S3 redirect).
      const h = { Authorization: `Bearer ${token}`, 'User-Agent': 'cognicare-game-fetch', 'X-GitHub-Api-Version': '2022-11-28' };
      const r = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${m.tag}`, { headers: { ...h, Accept: 'application/vnd.github+json' } });
      if (r.status === 404) throw new ReleaseMissing(`release ${m.tag} not found via API`);
      if (!r.ok) throw new Error(`GitHub API HTTP ${r.status}`);
      const a = (await r.json()).assets?.find((x) => x.name === m.asset);
      if (!a) throw new ReleaseMissing(`release ${m.tag} has no asset ${m.asset}`);
      return await httpDownload(a.url, { ...h, Accept: 'application/octet-stream' }, dest, m.bytes);
    }
    const url = `${base ?? 'https://github.com/' + repo + '/releases/download'}/${m.tag}/${m.asset}`;
    return await httpDownload(url, token ? { Authorization: `Bearer ${token}` } : {}, dest, m.bytes);
  } catch (e) {
    errors.push(e.message);
    const err = new Error(errors.join('; '));
    if (e instanceof ReleaseMissing) {
      throw new ReleaseMissing(
        `release ${m.tag} (asset ${m.asset}) not found in ${repo}. Was it uploaded? Run "npm run game:publish -- <id> <build> --release" or the gh command it prints. (private repo? set GAME_FETCH_TOKEN) [${err.message}]`,
      );
    }
    throw err;
  }
}

/** Fetches one game if missing/outdated. Returns 'skipped' | 'fetched'. Throws on any failure; never touches dest before verification. */
export async function fetchGame({ gamesDir, id, env = process.env, repo, log = console.log }) {
  const { state, manifest: m } = gameState(gamesDir, id);
  if (state === 'none') return 'skipped';
  if (state === 'current') return 'skipped';
  const tmp = fs.mkdtempSync(path.join(gamesDir, '.fetch-'));
  try {
    const zip = path.join(tmp, 'asset.zip');
    log(`${id}: downloading ${m.asset} (${(m.bytes / 1048576).toFixed(1)} MB) from release ${m.tag}`);
    await download(m, repo, env, zip, log);
    const size = fs.statSync(zip).size;
    if (size !== m.bytes) throw new Error(`${id}: size mismatch (got ${size}, manifest ${m.bytes}); not extracting`);
    const sum = sha256File(zip);
    if (sum !== m.sha256) throw new Error(`${id}: sha256 mismatch (got ${sum}, manifest ${m.sha256}); not extracting`);
    const out = path.join(tmp, 'x');
    fs.mkdirSync(out);
    const names = extractZip(zip, out);
    const v = validateSource(names);
    if (v.errors.length) throw new Error(`${id}: bad build in zip: ${v.errors.join(', ')}`);
    for (const n of ALLOWED) fs.renameSync(path.join(out, n), path.join(tmp, n));
    fs.writeFileSync(path.join(tmp, '.fetched-version'), m.version);
    swapIn(tmp, path.join(gamesDir, id), [...ALLOWED, '.fetched-version']);
    return 'fetched';
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (e) {
      log(`WARNING: could not remove ${tmp} (${e.code}); delete it manually`); // the swap already succeeded or rolled back
    }
  }
}
const ALLOWED = ['Build', 'TemplateData', 'index.html'];

async function main(argv) {
  const check = argv.includes('--check');
  if (argv.some((a) => a !== '--check')) {
    console.error('usage: npm run game:fetch [-- --check]');
    process.exit(1);
  }
  const root = fs.realpathSync(process.env.GAME_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const gamesDir = path.join(root, 'apps/web/public/games');
  const repo = process.env.GAME_RELEASE_REPO || originRepo(root) || EXPECTED_REPO;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    console.error(`ERROR: bad GAME_RELEASE_REPO ${JSON.stringify(repo)} (want owner/repo)`);
    process.exit(1);
  }
  let bad = 0;
  let any = false;
  for (const id of GAME_IDS) {
    try {
      const { state, manifest } = gameState(gamesDir, id);
      if (state === 'none') continue;
      any = true;
      if (check) {
        console.log(`${id}: ${state} (manifest ${manifest.version})`);
        if (state !== 'current') bad++;
      } else {
        const r = await fetchGame({ gamesDir, id, repo });
        console.log(r === 'skipped' ? `${id}: up to date (${manifest.version})` : `${id}: fetched ${manifest.version}`);
      }
    } catch (e) {
      console.error(`ERROR ${id}: ${e.message}`);
      bad++;
    }
  }
  if (!any) console.log('no game manifests (version.json) found; nothing to fetch');
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main(process.argv.slice(2));
