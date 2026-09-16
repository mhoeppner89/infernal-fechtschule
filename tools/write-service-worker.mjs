import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'site');

const roots = [
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'assets',
  'icons',
  'js'
];

/**
 * Every root that holds runtime art. The rule has to name all of them: it once
 * checked `assets/art/` alone, so when the cast moved to `assets/art-v2/` the
 * preview sheets and loose PNG strips under the new root quietly started
 * shipping — eight files, 6.8 MB, that no code path asks for.
 */
const ART_ROOTS = ['assets/art/', 'assets/art-v2/'];

function shouldPrecache(relativePath) {
  const normalized = relativePath.replaceAll(path.sep, '/');
  if (!ART_ROOTS.some((root) => normalized.startsWith(root))) return true;
  // Runtime sprites are optimized WebP files. Keep editable PNG strips,
  // preview sheets, seeds, and normalization metadata out of the offline payload.
  return !normalized.endsWith('.png') && !normalized.endsWith('/normalization.json');
}

async function walk(base, relativePath, files) {
  const absolutePath = path.join(base, relativePath);
  const entries = await readdir(absolutePath, { withFileTypes: true });
  for (const entry of entries) {
    const child = path.posix.join(relativePath.replaceAll(path.sep, '/'), entry.name);
    if (entry.isDirectory()) await walk(base, child, files);
    else if (!entry.name.endsWith('.map') && shouldPrecache(child)) files.push(child);
  }
  return files;
}

/** Every file the worker will precache, sorted and `./`-prefixed. */
export async function precacheList(siteDirectory = site) {
  const files = ['./'];
  for (const item of roots) {
    const absolute = path.join(siteDirectory, item);
    try {
      const statEntries = await readdir(absolute, { withFileTypes: true });
      if (statEntries) files.push(...await walk(siteDirectory, item, []));
    } catch {
      files.push(item);
    }
  }
  return [...new Set(files.map((file) => (file === './' ? file : `./${file}`)))].sort();
}

/**
 * Digest of the served bytes, so the cache name moves exactly when the build
 * moves. A name tied to `package.json`'s version stays put across every
 * hand-bumped release and a returning tab keeps whatever it cached first;
 * hashing content also means an unchanged rebuild does *not* make every client
 * re-download the payload.
 */
export async function contentDigest(siteDirectory, files) {
  const digest = createHash('sha1');
  for (const file of files) {
    if (file === './') continue;
    digest.update(file).update('\0');
    try {
      digest.update(await readFile(path.join(siteDirectory, file.replace(/^\.\//, ''))));
    } catch {
      digest.update('missing');
    }
  }
  return digest.digest('hex').slice(0, 10);
}

const source = (cache, core) => `const CACHE = ${JSON.stringify(cache)};\nconst CORE = ${JSON.stringify(core, null, 2)};\n\nself.addEventListener('install', (event) => {\n  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));\n  self.skipWaiting();\n});\n\nself.addEventListener('activate', (event) => {\n  event.waitUntil(\n    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))\n  );\n  self.clients.claim();\n});\n\nself.addEventListener('fetch', (event) => {\n  if (event.request.method !== 'GET') return;\n  // SEARCH-INSENSITIVE, deliberately. The precache is keyed without a query\n  // string, so a plain \`caches.match\` misses for every URL carrying one and\n  // falls through to the network. During a deploy that is how a tab ends up\n  // holding fresh markup and yesterday's scripts at the same time — and since\n  // the two are written together, a mixed pair is a broken page (a HUD element\n  // the old code looks for no longer exists), not a merely old one.\n  //\n  // Matching without the query keeps one build's own files together: the\n  // returning tab sees the previous build whole, and the new worker's\n  // \`skipWaiting\`/\`clients.claim\` plus the reload in \`main.ts\` moves it to the\n  // current one. Being a build behind is recoverable; being half of two is not.\n  event.respondWith(\n    caches.match(event.request, { ignoreSearch: true }).then((cached) => cached ?? fetch(event.request).then((response) => {\n      if (response.ok && new URL(event.request.url).origin === self.location.origin) {\n        const copy = response.clone();\n        void caches.open(CACHE).then((cache) => cache.put(event.request, copy));\n      }\n      return response;\n    }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html', { ignoreSearch: true }) : Response.error()))\n  );\n});\n`;

export async function writeServiceWorker({ siteDirectory = site, version } = {}) {
  const packageJson = version ?? JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
  const unique = await precacheList(siteDirectory);
  const cache = `infernal-fechtschule-${packageJson}-${await contentDigest(siteDirectory, unique)}`;
  await writeFile(path.join(siteDirectory, 'sw.js'), source(cache, unique));
  return { cache, files: unique.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { cache, files } = await writeServiceWorker();
  console.log(`Wrote site/sw.js with ${files} precached files (cache ${cache}).`);
}
