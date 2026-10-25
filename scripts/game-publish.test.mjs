import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSource, versionHash, sizePolicy, FAIL_BYTES, WARN_BYTES } from './game-publish.mjs';

const ok = ['index.html', 'TemplateData/a.css', 'Build/x.loader.js', 'Build/x.framework.js', 'Build/x.data', 'Build/x.wasm'];

test('validateSource accepts a complete build', () => {
  assert.deepEqual(validateSource(ok), { errors: [], compressed: [] });
});
test('validateSource reports missing parts', () => {
  const r = validateSource(['index.html', 'Build/x.loader.js']);
  assert.equal(r.errors.length, 4); // TemplateData, framework, data, wasm
});
test('validateSource accepts compression suffixes and reports them', () => {
  const r = validateSource(ok.map((f) => (f.startsWith('Build/') ? f + '.br' : f)));
  assert.deepEqual(r.errors, []);
  assert.equal(r.compressed.length, 4);
});
test('versionHash is stable, 12 hex, content sensitive, ignores TemplateData', () => {
  const a = [{ rel: 'index.html', content: Buffer.from('i') }, { rel: 'Build/a.wasm', content: Buffer.from('w') }];
  const h = versionHash(a);
  assert.match(h, /^[0-9a-f]{12}$/);
  assert.equal(versionHash([...a].reverse()), h);
  assert.equal(versionHash([...a, { rel: 'TemplateData/x', content: Buffer.from('z') }]), h);
  assert.notEqual(versionHash([a[0], { rel: 'Build/a.wasm', content: Buffer.from('W') }]), h);
});
test('sizePolicy warns >500MB, fails >2GB (release asset limit)', () => {
  const s = [{ rel: 'a', size: WARN_BYTES + 1 }, { rel: 'b', size: FAIL_BYTES + 1 }, { rel: 'c', size: 150 * 1048576 }];
  const r = sizePolicy(s);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /2 GB/);
});
