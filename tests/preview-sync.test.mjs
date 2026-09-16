import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { mirrorDirectory, readArmFile, syncPreview, writeArmFile, clearArmFile } from '../tools/preview-sync.mjs';
import { contentDigest, precacheList, writeServiceWorker } from '../tools/write-service-worker.mjs';

/**
 * The build now refreshes the preview copy itself, so this arm of the pipeline
 * has to be as trustworthy as the mirror it replaces: an incremental copy that
 * misses a byte, prunes a file it should keep, or ships the game's precache
 * worker into a copy would put yesterday's build in front of the player while
 * claiming the copy is current.
 */

async function workspace() {
  const base = await mkdtemp(path.join(tmpdir(), 'preview-sync-'));
  const source = path.join(base, 'source');
  const target = path.join(base, 'target');
  await mkdir(path.join(source, 'deep', 'deeper'), { recursive: true });
  await writeFile(path.join(source, 'index.html'), '<html>one</html>');
  await writeFile(path.join(source, 'deep', 'a.js'), 'export const a = 1;');
  await writeFile(path.join(source, 'deep', 'deeper', 'b.js'), 'export const b = 2;');
  await writeFile(path.join(source, 'gone.js'), 'export const gone = 0;');
  return { base, source, target, cleanup: () => rm(base, { recursive: true, force: true }) };
}

const exists = (file) => stat(file).then(() => true).catch(() => false);
const read = (file) => readFile(file, 'utf8').catch(() => null);

test('the first mirror copies everything the source has', async () => {
  const fixture = await workspace();
  try {
    const result = await mirrorDirectory(fixture.source, fixture.target);
    assert.equal(result.copied, 4);
    assert.equal(result.unchanged, 0);
    assert.equal(await read(path.join(fixture.target, 'deep', 'deeper', 'b.js')), 'export const b = 2;');
  } finally {
    await fixture.cleanup();
  }
});

test('an unchanged source is a no-op, so a rebuild does not thrash the copy', async () => {
  const fixture = await workspace();
  try {
    await mirrorDirectory(fixture.source, fixture.target);
    const again = await mirrorDirectory(fixture.source, fixture.target);
    assert.deepEqual({ copied: again.copied, removed: again.removed }, { copied: 0, removed: 0 });
    assert.equal(again.unchanged, 4);
  } finally {
    await fixture.cleanup();
  }
});

test('only the file that changed is copied again', async () => {
  const fixture = await workspace();
  try {
    await mirrorDirectory(fixture.source, fixture.target);
    const before = await stat(path.join(fixture.target, 'index.html'));
    await writeFile(path.join(fixture.source, 'deep', 'a.js'), 'export const a = 11;');
    await utimes(path.join(fixture.source, 'deep', 'a.js'), new Date(), new Date(Date.now() + 2000));
    const result = await mirrorDirectory(fixture.source, fixture.target);
    assert.equal(result.copied, 1);
    assert.equal(result.unchanged, 3);
    assert.equal(await read(path.join(fixture.target, 'deep', 'a.js')), 'export const a = 11;');
    assert.equal((await stat(path.join(fixture.target, 'index.html'))).mtimeMs, before.mtimeMs);
  } finally {
    await fixture.cleanup();
  }
});

test('a mirrored file keeps its source mtime, which is what makes the diff work', async () => {
  const fixture = await workspace();
  try {
    await mirrorDirectory(fixture.source, fixture.target);
    const source = await stat(path.join(fixture.source, 'deep', 'a.js'));
    const target = await stat(path.join(fixture.target, 'deep', 'a.js'));
    assert.ok(Math.abs(target.mtimeMs - source.mtimeMs) < 1);
  } finally {
    await fixture.cleanup();
  }
});

test('a file the build no longer emits leaves the copy, and so does its empty directory', async () => {
  const fixture = await workspace();
  try {
    await mirrorDirectory(fixture.source, fixture.target);
    await rm(path.join(fixture.source, 'gone.js'));
    await rm(path.join(fixture.source, 'deep', 'deeper'), { recursive: true });
    const result = await mirrorDirectory(fixture.source, fixture.target);
    assert.equal(result.removed, 2);
    assert.equal(await exists(path.join(fixture.target, 'gone.js')), false);
    assert.equal(await exists(path.join(fixture.target, 'deep', 'deeper')), false);
    // The directory that still holds a live file has to survive the prune.
    assert.equal(await exists(path.join(fixture.target, 'deep', 'a.js')), true);
  } finally {
    await fixture.cleanup();
  }
});

test('an excluded file is never copied and never pruned', async () => {
  const fixture = await workspace();
  try {
    await mirrorDirectory(fixture.source, fixture.target, { exclude: new Set(['gone.js']) });
    assert.equal(await exists(path.join(fixture.target, 'gone.js')), false);
    await writeFile(path.join(fixture.target, 'gone.js'), 'kept by the caller');
    await mirrorDirectory(fixture.source, fixture.target, { exclude: new Set(['gone.js']) });
    assert.equal(await read(path.join(fixture.target, 'gone.js')), 'kept by the caller');
  } finally {
    await fixture.cleanup();
  }
});

test('the preview copy runs the kill switch instead of the build precache worker', async () => {
  const fixture = await workspace();
  const built = "const CACHE = 'infernal-fechtschule-0.1.1-deadbeef00';\n";
  try {
    await mkdir(path.join(fixture.source, 'site'), { recursive: true });
    await mkdir(path.join(fixture.source, 'tools'), { recursive: true });
    await writeFile(path.join(fixture.source, 'site', 'sw.js'), built);
    await writeFile(path.join(fixture.source, 'tools', 'serve.mjs'), '// server\n');

    const result = await syncPreview({ dir: fixture.target, root: fixture.source, quiet: true });
    const worker = await read(path.join(fixture.target, 'site', 'sw.js'));
    assert.ok(worker.includes('caches.delete'), 'the copy must evict the build cache');
    assert.ok(worker.includes('registration.unregister'), 'and step aside so nothing can go stale');
    assert.ok(!worker.includes('cache.addAll'), 'a preview must not precache the payload');
    assert.ok(!worker.includes('CACHE = '), 'the copied file is not the build worker');
    // A refresh reports which build is being served, from the build's own worker.
    assert.equal(result.buildId, 'infernal-fechtschule-0.1.1-deadbeef00');
    assert.equal(await read(path.join(fixture.source, 'site', 'sw.js')), built);
    assert.equal(await read(path.join(fixture.target, 'tools', 'serve.mjs')), '// server\n');

    // Resyncing keeps the kill switch: it is excluded from both copy and prune.
    await syncPreview({ dir: fixture.target, root: fixture.source, quiet: true });
    assert.equal(await read(path.join(fixture.target, 'site', 'sw.js')), worker);
  } finally {
    await fixture.cleanup();
  }
});

test('a deploy copy is the real build, and refuses to swallow the checkout', async () => {
  const fixture = await workspace();
  const built = "const CACHE = 'infernal-fechtschule-0.1.1-deadbeef00';\n";
  const deploy = path.join(fixture.base, 'deploy');
  try {
    await mkdir(path.join(fixture.source, 'site'), { recursive: true });
    await mkdir(path.join(fixture.source, 'tools'), { recursive: true });
    await writeFile(path.join(fixture.source, 'site', 'sw.js'), built);
    await writeFile(path.join(fixture.source, 'tools', 'serve.mjs'), '// server\n');

    const result = await syncPreview({
      dir: fixture.target,
      deploy: { dir: deploy },
      root: fixture.source,
      quiet: true
    });
    // A deploy is the game itself, so it keeps the build's own worker and its
    // offline support, unlike the preview beside it.
    assert.equal(await read(path.join(deploy, 'site', 'sw.js')), built);
    assert.equal(await read(path.join(deploy, 'tools', 'serve.mjs')), '// server\n');
    assert.equal(result.deploy.buildId, 'infernal-fechtschule-0.1.1-deadbeef00');
    assert.equal(result.deploy.restarted, null, 'no agent labelled, nothing to restart');
    // Two copies, two caching policies, from one build.
    assert.ok((await read(path.join(fixture.target, 'site', 'sw.js'))).includes('caches.delete'));

    await assert.rejects(
      () => syncPreview({
        dir: fixture.target,
        deploy: { dir: path.dirname(fixture.source) },
        root: fixture.source,
        quiet: true
      }),
      /would contain the checkout/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('syncing refuses a directory that would swallow the checkout', async () => {
  const fixture = await workspace();
  try {
    await assert.rejects(
      () => syncPreview({ dir: path.dirname(fixture.base), root: path.join(fixture.base, 'source'), quiet: true }),
      /would contain the checkout/
    );
    await assert.rejects(
      () => syncPreview({ dir: path.join(fixture.base, 'source'), root: path.join(fixture.base, 'source'), quiet: true }),
      /onto itself/
    );
  } finally {
    await fixture.cleanup();
  }
});

test('arming is a checkout-local marker and nothing else', async () => {
  const fixture = await workspace();
  try {
    assert.equal(await readArmFile(fixture.base), null);
    await writeArmFile({ dir: '/tmp/somewhere', port: 4175 }, fixture.base);
    assert.deepEqual(await readArmFile(fixture.base), { dir: '/tmp/somewhere', port: 4175 });
    await clearArmFile(fixture.base);
    assert.equal(await readArmFile(fixture.base), null);
  } finally {
    await fixture.cleanup();
  }
});

test('the service-worker cache name follows the served bytes, not the version string', async () => {
  const fixture = await workspace();
  const site = path.join(fixture.base, 'site');
  try {
    await mkdir(path.join(site, 'js', 'sim'), { recursive: true });
    await writeFile(path.join(site, 'index.html'), '<html>build one</html>');
    await writeFile(path.join(site, 'js', 'sim', 'world.js'), 'export const tick = 1;');

    const first = await writeServiceWorker({ siteDirectory: site, version: '0.1.1' });
    assert.match(first.cache, /^infernal-fechtschule-0\.1\.1-[0-9a-f]{10}$/);

    // A rebuild that changes nothing must not invalidate every client's cache.
    const repeat = await writeServiceWorker({ siteDirectory: site, version: '0.1.1' });
    assert.equal(repeat.cache, first.cache);

    // Same version string, different bytes: the name has to move.
    await writeFile(path.join(site, 'js', 'sim', 'world.js'), 'export const tick = 2;');
    const changed = await writeServiceWorker({ siteDirectory: site, version: '0.1.1' });
    assert.notEqual(changed.cache, first.cache);

    // A new file moves it too, and a deleted one moves it back to nothing it has been.
    await writeFile(path.join(site, 'js', 'sim', 'items.js'), 'export const item = 1;');
    const added = await writeServiceWorker({ siteDirectory: site, version: '0.1.1' });
    assert.notEqual(added.cache, changed.cache);
    await rm(path.join(site, 'js', 'sim', 'items.js'));
    const removed = await writeServiceWorker({ siteDirectory: site, version: '0.1.1' });
    assert.equal(removed.cache, changed.cache);
  } finally {
    await fixture.cleanup();
  }
});

test('the precache list keeps editable art out of every art root', async () => {
  const fixture = await workspace();
  const site = path.join(fixture.base, 'site');
  try {
    // Two art roots, because the rule has to name all of them: the runtime cast
    // moved to art-v2 while the exclusion still checked the v1 prefix, and the
    // preview sheets under the new root shipped for it. Both roots are covered.
    for (const root of ['art', 'art-v2']) {
      await mkdir(path.join(site, 'assets', root, 'thug'), { recursive: true });
      await mkdir(path.join(site, 'assets', root, 'previews'), { recursive: true });
      await writeFile(path.join(site, 'assets', root, 'thug', '01.webp'), 'webp');
      await writeFile(path.join(site, 'assets', root, 'thug', '01.png'), 'png');
      await writeFile(path.join(site, 'assets', root, 'thug', 'normalization.json'), '{}');
      await writeFile(path.join(site, 'assets', root, 'thug', 'clip.json'), '{}');
      await writeFile(path.join(site, 'assets', root, 'thug', 'strip.png.map'), 'ignored');
      await writeFile(path.join(site, 'assets', root, 'previews', 'thug-animation.png'), 'png');
    }
    await writeFile(path.join(site, 'index.html'), '<html></html>');
    const files = await precacheList(site);
    for (const root of ['art', 'art-v2']) {
      assert.ok(files.includes(`./assets/${root}/thug/01.webp`));
      assert.ok(!files.includes(`./assets/${root}/thug/01.png`), 'editable strips stay out of the payload');
      assert.ok(!files.includes(`./assets/${root}/thug/normalization.json`));
      assert.ok(files.includes(`./assets/${root}/thug/clip.json`), 'runtime clips stay in');
      assert.ok(
        !files.includes(`./assets/${root}/previews/thug-animation.png`),
        'preview sheets stay out of the payload'
      );
    }
    assert.ok(!files.some((file) => file.endsWith('.map')), 'source maps stay out of the payload');
    assert.deepEqual(files, [...files].sort(), 'the list is sorted, so its order cannot move the digest');
    assert.match(await contentDigest(site, files), /^[0-9a-f]{10}$/);
    assert.equal(await contentDigest(site, files), await contentDigest(site, files), 'digesting is stable');
  } finally {
    await fixture.cleanup();
  }
});
