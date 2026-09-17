import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'site');
// The complete procedural runtime. Art source/gallery trees never ship offline.
const roots = ['index.html', 'styles.css', 'manifest.webmanifest', 'icons', 'js'];
const retiredModules = new Set(['animation-manifest.js', 'animation-catalog.js', 'background-catalog.js']);
async function walk(base, relative, files) {
  let info;
  try { info = await stat(path.join(base, relative)); }
  catch (error) { if (error.code === 'ENOENT') return files; throw error; }
  if (!info.isDirectory()) {
    if (!relative.endsWith('.map') && !retiredModules.has(path.basename(relative))) files.push(relative);
    return files;
  }
  for (const entry of await readdir(path.join(base, relative), { withFileTypes: true })) {
    await walk(base, path.posix.join(relative, entry.name), files);
  }
  return files;
}
export async function precacheList(siteDirectory = site) {
  const files = ['./'];
  for (const relative of roots) await walk(siteDirectory, relative, files);
  return [...new Set(files.map(file => file === './' ? file : `./${file}`))].sort();
}

export async function contentDigest(siteDirectory, files) {
  const digest = createHash('sha1');
  for (const file of files) {
    if (file === './') continue;
    digest.update(file).update('\0');
    digest.update(await readFile(path.join(siteDirectory, file.replace(/^\.\//, ''))));
  }
  return digest.digest('hex').slice(0, 10);
}

const source = (cache, core) => `const CACHE = ${JSON.stringify(cache)};
const CORE = ${JSON.stringify(core, null, 2)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(event.request);
    } catch {
      return event.request.mode === 'navigate'
        ? await cache.match('./index.html', { ignoreSearch: true }) || Response.error()
        : Response.error();
    }
  }));
});
`;

export async function writeServiceWorker({ siteDirectory = site, version } = {}) {
  const packageVersion = version ?? JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version;
  const files = await precacheList(siteDirectory);
  const cache = `infernal-fechtschule-${packageVersion}-${await contentDigest(siteDirectory, files)}`;
  await writeFile(path.join(siteDirectory, 'sw.js'), source(cache, files));
  return { cache, files: files.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await writeServiceWorker();
  console.log(`Wrote site/sw.js with ${result.files} procedural-runtime entries (${result.cache}).`);
}
