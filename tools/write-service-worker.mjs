import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'site');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

const roots = [
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'assets',
  'icons',
  'js'
];

function shouldPrecache(relativePath) {
  const normalized = relativePath.replaceAll(path.sep, '/');
  if (!normalized.startsWith('assets/art/')) return true;
  // Runtime sprites are optimized WebP files. Keep editable PNG strips,
  // previews, seeds, and normalization metadata out of the offline payload.
  return !normalized.endsWith('.png') && !normalized.endsWith('/normalization.json');
}

async function walk(relativePath) {
  const absolutePath = path.join(site, relativePath);
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.posix.join(relativePath.replaceAll(path.sep, '/'), entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (!entry.name.endsWith('.map') && shouldPrecache(child)) files.push(child);
  }
  return files;
}

const files = ['./'];
for (const item of roots) {
  const absolute = path.join(site, item);
  try {
    const statEntries = await readdir(absolute, { withFileTypes: true });
    if (statEntries) files.push(...await walk(item));
  } catch {
    files.push(item);
  }
}

const unique = [...new Set(files.map((file) => file === './' ? file : `./${file}`))].sort();
const source = `const CACHE = 'infernal-fechtschule-v${packageJson.version}';\nconst CORE = ${JSON.stringify(unique, null, 2)};\n\nself.addEventListener('install', (event) => {\n  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));\n  self.skipWaiting();\n});\n\nself.addEventListener('activate', (event) => {\n  event.waitUntil(\n    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))\n  );\n  self.clients.claim();\n});\n\nself.addEventListener('fetch', (event) => {\n  if (event.request.method !== 'GET') return;\n  event.respondWith(\n    caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {\n      if (response.ok && new URL(event.request.url).origin === self.location.origin) {\n        const copy = response.clone();\n        void caches.open(CACHE).then((cache) => cache.put(event.request, copy));\n      }\n      return response;\n    }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))\n  );\n});\n`;

await writeFile(path.join(site, 'sw.js'), source);
console.log(`Wrote site/sw.js with ${unique.length} precached files.`);
