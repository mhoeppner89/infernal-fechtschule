import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { precacheList } from '../tools/write-service-worker.mjs';
import { ANIMATION_MANIFEST } from '../site/js/render/animation-manifest.js';
import { BACKGROUND_MANIFEST } from '../site/js/render/background-catalog.js';

const SITE = fileURLToPath(new URL('../site/', import.meta.url));

/**
 * Budgets, measured on the build that introduced this test. They are guards
 * against a whole tree or a lossless export arriving unnoticed — the failure
 * this file exists for shipped 382 frames and 135 MB that no code path could
 * load — so each has real headroom for the art pass that follows, and the
 * *reference* check below is what decides the file count rather than these.
 *
 *   payload      971 files / 21.3 MB
 *   sprite frames 792 at 23.5 KB mean, 33 KB largest
 *   backdrops       4 at 200-308 KB (1280x720 drawn images, not sprites)
 */
const MAX_PAYLOAD_BYTES = 60 * 1024 * 1024;
const MAX_PAYLOAD_FILES = 2200;
const MAX_FRAME_BYTES = 64 * 1024;
const MEAN_FRAME_BYTES = 40 * 1024;

/** Every payload path under an art root, sprite or backdrop. */
const ART_PREFIX = 'assets/art';

/**
 * Art the payload carries that the runtime never asks for, but the pipeline
 * does: the per-clip contract beside each strip's frames, the rig manifest and
 * the rig/weapon definitions that produced them, and the pipeline's own README.
 * Anything else under `assets/art*` has to be named by the manifest or the
 * scenery catalogue — that is the rule that catches a superseded tree.
 */
const PIPELINE_METADATA = [
  /\/clip\.json$/,
  /^assets\/art-v2\/manifest-v2\.json$/,
  /^assets\/art-v2\/source\//,
  /^assets\/art-v2\/README\.md$/
];

/**
 * Clips the rig authors ahead of wiring them: the light-after-heavy and
 * heavy-after-light variants (`ls_lh`, `ls_hl`, `ls_l2h`, `ls_low_h` and the
 * four dussack twins). They have no `ATTACKS` entry, so nothing can play them,
 * and they are declared here rather than deleted because a chain pass is the
 * obvious consumer. The declaration is a list on purpose: a ninth folder, or a
 * tree, fails until someone says what it is — and the byte ceiling keeps the
 * declared set from becoming the next 135 MB.
 */
const UNWIRED_VARIANTS = [
  'assets/art-v2/meyer/longsword/ls_hl/',
  'assets/art-v2/meyer/longsword/ls_lh/',
  'assets/art-v2/meyer/longsword/ls_l2h/',
  'assets/art-v2/meyer/longsword/ls_low_h/',
  'assets/art-v2/meyer/dussack/ds_hl/',
  'assets/art-v2/meyer/dussack/ds_lh/',
  'assets/art-v2/meyer/dussack/ds_l2h/',
  'assets/art-v2/meyer/dussack/ds_low_h/'
];
const MAX_UNWIRED_BYTES = 2 * 1024 * 1024;

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

let cached = null;

/** The precache the build would write now, with each entry's size in bytes. */
async function payload() {
  if (cached) return cached;
  const listed = await precacheList();
  const sizes = new Map();
  for (const entry of listed) {
    const relative = entry.replace(/^\.\//, '');
    if (relative === '') continue;
    sizes.set(relative, statSync(`${SITE}${relative}`).size);
  }
  cached = { listed, sizes };
  return cached;
}

/** Every art URL the game or its scenery catalogue resolves at runtime. */
function referencedArt() {
  const paths = new Set();
  for (const clip of ANIMATION_MANIFEST) {
    for (const frame of clip.frames) paths.add(frame.url);
  }
  for (const spec of Object.values(BACKGROUND_MANIFEST)) {
    paths.add(spec.url);
    for (const layer of spec.layers ?? []) paths.add(layer.url);
    if (spec.road) paths.add(spec.road.url);
  }
  return paths;
}

test('nothing an art tree ships that the game and its pipeline do not name', async () => {
  const { sizes } = await payload();
  const referenced = referencedArt();
  const shipped = [...sizes.keys()].filter((path) => path.startsWith(ART_PREFIX));
  assert.ok(shipped.length > 700, `expected the art to be in the payload, found ${shipped.length}`);

  const orphans = shipped.filter((path) => {
    if (referenced.has(path)) return false;
    if (PIPELINE_METADATA.some((pattern) => pattern.test(path))) return false;
    return !UNWIRED_VARIANTS.some((folder) => path.startsWith(folder));
  });

  const wasted = orphans.reduce((total, path) => total + sizes.get(path), 0);
  assert.deepEqual(
    orphans.slice(0, 8),
    [],
    `${orphans.length} art files (${mb(wasted)}) ship without anything naming them; ` +
      'if they are only source, they belong outside site/, and if they are authored ' +
      'ahead of wiring, declare them beside the other unwired variants'
  );

  const unwired = shipped
    .filter((path) => UNWIRED_VARIANTS.some((folder) => path.startsWith(folder)))
    .reduce((total, path) => total + sizes.get(path), 0);
  assert.ok(
    unwired <= MAX_UNWIRED_BYTES,
    `the declared unwired variants hold ${mb(unwired)}; budget is ${mb(MAX_UNWIRED_BYTES)}`
  );
});

test('every frame and backdrop the game asks for is actually in the payload', async () => {
  const { sizes } = await payload();
  const missing = [];
  for (const path of referencedArt()) {
    if (!sizes.has(path)) missing.push(path);
  }
  assert.deepEqual(
    missing.slice(0, 8),
    [],
    `${missing.length} referenced art files are absent from the payload, so an offline ` +
      'tab would run without them'
  );
});

test('a sprite frame stays cheap, so the cast can grow without the download following', async () => {
  const { sizes } = await payload();
  const frames = [...sizes.entries()].filter(
    ([path, size]) => path.startsWith(`${ART_PREFIX}-v2/`) && path.endsWith('.webp') && size > 0
  );
  assert.ok(frames.length > 500, `expected the sprite cast, found ${frames.length} frames`);

  const largest = frames.reduce((worst, entry) => (entry[1] > worst[1] ? entry : worst));
  assert.ok(
    largest[1] <= MAX_FRAME_BYTES,
    `largest sprite frame is ${kb(largest[1])} (${largest[0]}); budget is ${kb(MAX_FRAME_BYTES)}`
  );

  const mean = frames.reduce((total, [, size]) => total + size, 0) / frames.length;
  assert.ok(
    mean <= MEAN_FRAME_BYTES,
    `mean sprite frame is ${kb(mean)} over ${frames.length} frames; budget is ${kb(MEAN_FRAME_BYTES)}`
  );
});

test('the payload as a whole stays inside its budget and carries no editable art', async () => {
  const { sizes } = await payload();
  const files = sizes.size;
  const bytes = [...sizes.values()].reduce((total, size) => total + size, 0);
  assert.ok(files <= MAX_PAYLOAD_FILES, `payload is ${files} files; budget is ${MAX_PAYLOAD_FILES}`);
  assert.ok(bytes <= MAX_PAYLOAD_BYTES, `payload is ${mb(bytes)}; budget is ${mb(MAX_PAYLOAD_BYTES)}`);

  // The exclusion rule that once keyed on a single art root, letting the
  // preview sheets under the next one ship. Editable sources stay out.
  const editable = [...sizes.keys()].filter(
    (path) =>
      path.startsWith(ART_PREFIX) &&
      (path.endsWith('.png') || path.endsWith('/normalization.json'))
  );
  assert.deepEqual(editable.slice(0, 8), [], 'editable art sources must not be in the payload');
});
