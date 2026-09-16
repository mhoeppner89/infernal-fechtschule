/**
 * Mirrors the built `site/` into every copy this checkout is served from, so no
 * server can ever be showing a build the checkout has moved past.
 *
 * A detached server cannot serve this checkout in place (see `.freebuff/run.md`:
 * macOS TCC denies a launchd-spawned process read access under `~/Desktop`), so
 * the game is served from copies. `npm run build` calls this script, which is
 * what makes them current; nothing about a copy is maintained by hand.
 *
 * Nothing happens until the checkout is *armed*, so other worktrees and fresh
 * checkouts are untouched by the build hook:
 *
 *   node tools/preview-sync.mjs --dir /tmp/infernal-preview --port 4175   # arm a preview
 *   node tools/preview-sync.mjs --deploy-dir ~/Library/.../app \\
 *     --deploy-label com.infernal-fechtschule.serve                       # arm the deploy
 *   npm run build                                                         # syncs both
 *   node tools/preview-sync.mjs --status                                  # report drift
 *   node tools/preview-sync.mjs --disarm                                  # opt out
 *
 * The two kinds of copy are not the same thing, and the difference is the
 * worker. A *preview* gets a kill-switch worker in place of the game's precache
 * worker: the real one precaches the whole build under a cache name derived from
 * build content, so it would happily serve yesterday's JavaScript to a tab
 * opened after a fresh build. The kill switch deletes every cache and unregisters
 * itself, leaving `serve.mjs`'s `no-cache` header as the only caching policy in
 * play — that costs offline support in the preview, which is exactly the point,
 * because a preview must never be offline. A *deploy* is the game itself, so it
 * keeps the real worker and its offline support, and gets its launchd agent
 * kickstarted afterwards if a label is armed.
 *
 * The deploy target exists because its absence was a live bug: the durable
 * server on 4174 was refreshed by hand, drifted, and spent a week serving a
 * top-of-screen HUD that no longer existed in `src/` while every build kept the
 * preview next to it current.
 */
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, stat, unlink, utimes, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARM_FILE = path.join('.freebuff', 'preview-sync.json');
const SITE = 'site';
const WORKER = 'sw.js';
const SERVER = path.join('tools', 'serve.mjs');

/** Evicts the real build's precache and steps aside. Never navigates clients:
 *  a worker that reloads on activate is re-registered on every load and loops. */
const KILL_SWITCH = `// Preview copy of the worker. It evicts the build's precache and unregisters,
// so a stale cache can never outlive a build. Do not copy this into a deploy.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.registration.unregister())
  );
});
`;

const armPath = (root = ROOT) => path.join(root, ARM_FILE);

async function listFiles(directory, prefix = '', out = []) {
  let entries;
  try {
    entries = await readdir(path.join(directory, prefix), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const relative = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    if (entry.isDirectory()) await listFiles(directory, relative, out);
    else out.push(relative);
  }
  return out;
}

/** Removes directories that a prune emptied, deepest first. */
async function pruneEmptyDirectories(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const child = path.join(directory, entry.name);
    await pruneEmptyDirectories(child);
    if ((await readdir(child)).length === 0) await rm(child, { recursive: true });
  }
}

/**
 * Brings `destination` into line with `source`: copies files whose size or
 * mtime moved, drops files the source no longer has, and leaves the rest
 * alone. Copying preserves mtime, so the next run can tell them apart.
 *
 * An `exclude`d path is one the caller owns in the destination: it is neither
 * copied nor pruned (the preview copy's worker, which is deliberately not the
 * build's worker).
 */
export async function mirrorDirectory(source, destination, { exclude = new Set() } = {}) {
  await mkdir(destination, { recursive: true });
  const wanted = new Set();
  let copied = 0;
  let unchanged = 0;
  for (const relative of await listFiles(source)) {
    if (exclude.has(relative)) continue;
    wanted.add(relative);
    const from = path.join(source, relative);
    const to = path.join(destination, relative);
    const sourceStat = await stat(from);
    let targetStat = null;
    try {
      targetStat = await stat(to);
    } catch {
      targetStat = null;
    }
    if (
      targetStat &&
      targetStat.size === sourceStat.size &&
      Math.abs(targetStat.mtimeMs - sourceStat.mtimeMs) < 1
    ) {
      unchanged += 1;
      continue;
    }
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(from, to);
    await utimes(to, sourceStat.atime, sourceStat.mtime);
    copied += 1;
  }

  let removed = 0;
  for (const relative of await listFiles(destination)) {
    if (wanted.has(relative) || exclude.has(relative)) continue;
    await unlink(path.join(destination, relative));
    removed += 1;
  }
  await pruneEmptyDirectories(destination);
  return { copied, removed, unchanged };
}

/** The cache name `write-service-worker.mjs` stamped, i.e. what is being served. */
export async function servedBuildId(root = ROOT) {
  try {
    const source = await readFile(path.join(root, SITE, WORKER), 'utf8');
    return source.match(/const CACHE = ['"]([^'"]+)['"]/)?.[1] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function readArmFile(root = ROOT) {
  try {
    const parsed = JSON.parse(await readFile(armPath(root), 'utf8'));
    return parsed && typeof parsed.dir === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeArmFile(entry, root = ROOT) {
  await mkdir(path.dirname(armPath(root)), { recursive: true });
  await writeFile(armPath(root), `${JSON.stringify(entry, null, 2)}\n`);
  return entry;
}

export async function clearArmFile(root = ROOT) {
  await rm(armPath(root), { force: true });
}

/** Refuses a copy that is the checkout, or would swallow it. */
function assertOutsideCheckout(copy, root, what) {
  if (copy === path.resolve(root)) {
    throw new Error('Refusing to mirror the checkout onto itself.');
  }
  if (path.resolve(root).startsWith(`${copy}${path.sep}`)) {
    throw new Error(`${what} ${copy} would contain the checkout; pick a directory outside it.`);
  }
}

/** Copies `tools/serve.mjs` into a copy, which is what makes it servable. */
async function copyServer(root, copy) {
  // The running server keeps its own `serve.mjs` loaded, so refreshing this
  // file only matters after a restart; it is copied so the copy stays complete.
  const source = await readFile(path.join(root, SERVER)).catch(() => null);
  if (!source) return { copied: 0 };
  const target = path.join(copy, SERVER);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source);
  return { copied: 1 };
}

/**
 * Runs `launchctl kickstart` for the agent that serves a copy, so a restart
 * picks up anything the process itself caches. Best-effort: a checkout without
 * that agent armed still publishes.
 */
function kickstartAgent(label) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  const result = spawnSync('launchctl', ['kickstart', '-k', `gui/${uid}/${label}`], { stdio: 'ignore' });
  return result.status === 0;
}

/** Publishes to a deploy copy: the real build, worker, offline support and all. */
async function publishDeploy({ root, deploy }) {
  const target = path.resolve(deploy.dir);
  assertOutsideCheckout(target, root, 'Deploy copy');
  const site = await mirrorDirectory(path.join(root, SITE), path.join(target, SITE));
  await copyServer(root, target);
  return {
    dir: target,
    site,
    buildId: await servedBuildId(target),
    restarted: deploy.label ? kickstartAgent(deploy.label) : null
  };
}

/** Copies the built site (and the server) into the preview copy, and the deploy too. */
export async function syncPreview({ dir, deploy = null, quiet = false, root = ROOT } = {}) {
  const started = Date.now();
  const copy = path.resolve(dir);
  assertOutsideCheckout(copy, root, 'Preview copy');

  const site = await mirrorDirectory(path.join(root, SITE), path.join(copy, SITE), {
    // The preview runs the kill switch, never the build's precache worker.
    exclude: new Set([WORKER])
  });
  await writeFile(path.join(copy, SITE, WORKER), KILL_SWITCH);
  const server = await copyServer(root, copy);
  const elapsed = Date.now() - started;
  const result = { dir: copy, site, server, buildId: await servedBuildId(root), elapsed };
  if (!quiet) {
    console.log(
      `preview: ${copy} ← ${site.copied} copied, ${site.removed} removed, ${site.unchanged} unchanged` +
        ` (${elapsed} ms) · serving ${result.buildId}`
    );
  }

  if (deploy?.dir) {
    const published = await publishDeploy({ root, deploy });
    result.deploy = published;
    if (!quiet) {
      const stale = published.buildId !== result.buildId ? ` — SERVING ${published.buildId}` : '';
      console.log(
        `deploy:  ${published.dir} ← ${published.site.copied} copied, ${published.site.removed} removed,` +
          ` ${published.site.unchanged} unchanged` +
          `${published.restarted === null ? '' : published.restarted ? ', agent restarted' : ', agent restart failed'}` +
          stale
      );
    }
  }
  return result;
}

async function listening(port) {
  try {
    const response = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

async function reportStatus() {
  const armed = await readArmFile();
  if (!armed) {
    console.log(`preview: not armed (${ARM_FILE} absent) — the build hook is a no-op.`);
    return 0;
  }
  const built = await servedBuildId();
  const exists = await stat(path.join(armed.dir, SITE)).then(() => true).catch(() => false);
  const serves = typeof armed.port === 'number' ? await listening(armed.port) : null;
  console.log(`preview: armed → ${armed.dir}`);
  console.log(`  copy:   ${exists ? 'present' : 'missing (next build recreates it)'}`);
  console.log(`  build:  ${built}`);
  if (armed.port !== undefined) {
    console.log(`  port:   ${armed.port} ${serves ? 'answering' : 'not answering'}`);
  }
  if (serves === false) {
    console.log('  hint:   relaunch the detached server — see .freebuff/run.md');
  }
  if (armed.deploy?.dir) {
    const present = await stat(path.join(armed.deploy.dir, SITE)).then(() => true).catch(() => false);
    const deployed = await servedBuildId(armed.deploy.dir);
    // The one question worth asking about a copy nobody edits by hand: is what it
    // serves still this checkout's build?
    const verdict = deployed === 'unknown'
      ? 'never published'
      : deployed === built ? 'in step with this checkout' : `STALE — this checkout builds ${built}`;
    console.log(`  deploy: ${armed.deploy.dir}`);
    console.log(`          ${present ? 'present' : 'missing (next build recreates it)'} · ${verdict}`);
  }
  return 0;
}

function parseArguments(argv) {
  const options = {
    dir: null,
    port: undefined,
    log: null,
    label: null,
    deployDir: null,
    deployLabel: null,
    disarm: false,
    status: false,
    require: false,
    quiet: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => argv[(index += 1)];
    if (argument === '--dir') options.dir = value();
    else if (argument === '--port') options.port = Number(value());
    else if (argument === '--log') options.log = value();
    else if (argument === '--label') options.label = value();
    else if (argument === '--deploy-dir') options.deployDir = value();
    else if (argument === '--deploy-label') options.deployLabel = value();
    else if (argument === '--disarm') options.disarm = true;
    else if (argument === '--status') options.status = true;
    else if (argument === '--require') options.require = true;
    else if (argument === '--quiet') options.quiet = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function main(argv) {
  const options = parseArguments(argv);

  if (options.disarm) {
    await clearArmFile();
    console.log(`preview: disarmed (${ARM_FILE} removed) — the build hook is a no-op again.`);
    return 0;
  }
  if (options.status) return reportStatus();

  const existing = await readArmFile();
  if (options.dir || options.deployDir) {
    // The preview directory is the one the tool is named for and the one every
    // build refreshes; a deploy copy is added to it rather than replacing it.
    const dir = options.dir ? path.resolve(options.dir) : existing?.dir ?? null;
    if (!dir) throw new Error(`No preview directory: pass --dir <path> along with --deploy-dir.`);
    const deployDir = options.deployDir ? path.resolve(options.deployDir) : existing?.deploy?.dir ?? null;
    await writeArmFile({
      dir,
      port: options.port ?? existing?.port,
      log: options.log ?? existing?.log,
      label: options.label ?? existing?.label,
      deploy: deployDir
        ? { dir: deployDir, label: options.deployLabel ?? existing?.deploy?.label ?? null }
        : null
    });
  } else if (!existing) {
    if (options.require) throw new Error(`No ${ARM_FILE}; arm one with --dir <path> first.`);
    return 0;
  }

  const armed = (await readArmFile()) ?? { dir: null };
  const dir = options.dir ? path.resolve(options.dir) : armed.dir;
  if (!dir) throw new Error(`No preview directory: pass --dir <path> to arm the build hook.`);
  await syncPreview({ dir, deploy: armed.deploy ?? null, quiet: options.quiet });
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`preview-sync: ${error.message}`);
    process.exitCode = 1;
  });
}
