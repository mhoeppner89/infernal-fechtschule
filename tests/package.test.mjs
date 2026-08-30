import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

test('every literal UI id used by the TypeScript exists in the game shell', async () => {
  const html = await readFile(path.join(root, 'site/index.html'), 'utf8');
  const ui = await readFile(path.join(root, 'src/ui/ui.ts'), 'utf8');
  const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
  const requested = new Set();
  for (const pattern of [
    /requireElement(?:<[^>]+>)?\(['"]([^'"]+)['"]\)/g,
    /setText\(['"]([^'"]+)['"]/g,
    /setBar\(['"]([^'"]+)['"]/g
  ]) {
    for (const match of ui.matchAll(pattern)) requested.add(match[1]);
  }
  const missing = [...requested].filter((id) => !ids.has(id));
  assert.deepEqual(missing, []);
});

test('all compiled relative ES-module imports resolve', async () => {
  const jsRoot = path.join(root, 'site/js');
  const files = (await walk(jsRoot)).filter((file) => file.endsWith('.js'));
  const unresolved = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const imports = [
      ...source.matchAll(/\bfrom\s+["']([^"']+)["']/g),
      ...source.matchAll(/\bimport\s+["']([^"']+)["']/g)
    ].map((match) => match[1]).filter((specifier) => specifier.startsWith('.'));
    for (const specifier of imports) {
      const target = path.resolve(path.dirname(file), specifier);
      try { await stat(target); }
      catch { unresolved.push(`${path.relative(root, file)} -> ${specifier}`); }
    }
  }
  assert.deepEqual(unresolved, []);
});

test('the service worker precaches only files present in the shipped site', async () => {
  const source = await readFile(path.join(root, 'site/sw.js'), 'utf8');
  const match = source.match(/const CORE = (\[[\s\S]*?\]);/);
  assert.ok(match, 'CORE precache list should be present');
  const entries = JSON.parse(match[1]);
  const missing = [];
  for (const entry of entries) {
    if (entry === './') continue;
    const relative = entry.replace(/^\.\//, '');
    try { await stat(path.join(root, 'site', relative)); }
    catch { missing.push(entry); }
  }
  assert.deepEqual(missing, []);
  assert.ok(entries.includes('./js/main.js'));
  assert.ok(entries.includes('./manifest.webmanifest'));
});

test('manifest icons and start URL are valid package-relative assets', async () => {
  const manifest = JSON.parse(await readFile(path.join(root, 'site/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.orientation, 'landscape');
  for (const icon of manifest.icons) {
    const iconPath = icon.src.replace(/^\.\//, '');
    await stat(path.join(root, 'site', iconPath));
  }
});
