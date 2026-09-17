import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { precacheList } from '../tools/write-service-worker.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SITE = path.join(ROOT, 'site');
const COMPILED = path.join(SITE, 'js');
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const MAX_PAYLOAD_FILES = 80;

function filesUnder(directory) {
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else files.push(absolute);
    }
  };
  visit(directory);
  return files;
}

function runtimeModuleFiles() {
  const sourceRoots = [
    path.join(ROOT, 'src', 'app'),
    path.join(ROOT, 'src', 'audio'),
    path.join(ROOT, 'src', 'input'),
    path.join(ROOT, 'src', 'network'),
    path.join(ROOT, 'src', 'render'),
    path.join(ROOT, 'src', 'sim'),
    path.join(ROOT, 'src', 'ui'),
    path.join(ROOT, 'src', 'main.ts')
  ];
  return sourceRoots.flatMap((entry) => {
    if (statSync(entry).isDirectory()) return filesUnder(entry).filter((file) => file.endsWith('.ts'));
    return [entry];
  });
}

function compiledModuleFiles() {
  return filesUnder(COMPILED).filter((file) => file.endsWith('.js'));
}

function moduleSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /\bfrom\s*["'](\.[^"']+)["']/g,
    /\bimport\s*["'](\.[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']+)["']/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  }
  return specifiers;
}

function statExists(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function missingCompiledImports() {
  const missing = [];
  for (const file of compiledModuleFiles()) {
    const source = readFileSync(file, 'utf8');
    for (const specifier of moduleSpecifiers(source)) {
      const target = path.resolve(path.dirname(file), specifier);
      if (!target.startsWith(`${COMPILED}${path.sep}`) || !statExists(target)) {
        missing.push(`${path.relative(ROOT, file)} -> ${specifier}`);
      }
    }
  }
  return missing;
}

async function payloadSnapshot() {
  const listed = await precacheList();
  const entries = listed.map((entry) => {
    const relative = entry.replace(/^\.\//, '');
    const absolute = path.join(SITE, relative);
    return {
      entry,
      relative,
      bytes: relative === '' || !statExists(absolute) ? 0 : statSync(absolute).size
    };
  });
  return {
    listed,
    entries,
    bytes: entries.reduce((total, entry) => total + entry.bytes, 0)
  };
}

test('the procedural runtime has no sprite or background image dependency', () => {
  const forbidden = [
    /\bnew\s+Image\s*\(/,
    /\bcreateImageBitmap\s*\(/,
    /assets\/art(?:-v2)?\//,
    /\.webp(?:["'`\s;),]|$)/i,
    /(?:animation-catalog|animation-manifest|background-catalog)(?:\.js)?/i
  ];
  const offenders = [];
  for (const file of [...runtimeModuleFiles(), ...compiledModuleFiles()]) {
    const source = readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      if (pattern.test(source)) {
        offenders.push(`${path.relative(ROOT, file)} matches ${pattern}`);
        break;
      }
    }
  }
  assert.deepEqual(offenders, [], 'active runtime must be fully procedural and catalog-free');
});

test('all compiled runtime module references resolve to files', () => {
  assert.deepEqual(missingCompiledImports(), [], 'compiled runtime has a broken relative import');
});

test('the precache contains only existing files and excludes both retired art trees', async () => {
  const { listed, entries } = await payloadSnapshot();
  const missing = entries
    .filter((entry) => entry.relative !== '' && !statExists(path.join(SITE, entry.relative)))
    .map((entry) => entry.entry);
  assert.deepEqual(missing, [], 'every precache entry must exist in the served site');
  assert.ok(!listed.some((entry) => entry.startsWith('./assets/')), 'runtime assets are not precached');
  assert.ok(!listed.some((entry) => /^\.\/assets\/(?:art|art-v2)(?:\/|$)/.test(entry)));
  assert.ok(!listed.some((entry) => entry.endsWith('.webp')), 'raster frames are not precached');
  assert.ok(!listed.some((entry) => /(?:animation-catalog|animation-manifest|background-catalog)\.js$/.test(entry)));
});

test('the measured procedural precache stays within the small offline budget', async () => {
  const { listed, bytes } = await payloadSnapshot();
  assert.ok(
    listed.length <= MAX_PAYLOAD_FILES,
    `procedural precache is ${listed.length} files; budget is ${MAX_PAYLOAD_FILES}`
  );
  assert.ok(
    bytes <= MAX_PAYLOAD_BYTES,
    `procedural precache is ${(bytes / 1048576).toFixed(2)} MiB; budget is ${(MAX_PAYLOAD_BYTES / 1048576).toFixed(2)} MiB`
  );
});
