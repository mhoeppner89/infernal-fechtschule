#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function parseArgs(argv) {
  const options = {
    url: 'http://localhost:4174/animation-gallery.html',
    out: '/private/tmp/infernal-animation-gallery',
    timeoutMs: 30000,
    headed: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const raw = argv[index];
    const separator = raw.indexOf('=');
    const key = separator >= 0 ? raw.slice(0, separator) : raw;
    const inline = separator >= 0 ? raw.slice(separator + 1) : null;
    const next = inline ?? argv[index + 1];
    if (key === '--url' && next) {
      options.url = next;
      if (inline === null) index += 1;
    } else if (key === '--out' && next) {
      options.out = path.resolve(next);
      if (inline === null) index += 1;
    } else if (key === '--timeout-ms' && next) {
      options.timeoutMs = Math.max(1000, Number(next));
      if (inline === null) index += 1;
    } else if (key === '--headed') {
      options.headed = inline === null || inline === '1' || inline === 'true';
    }
  }
  return options;
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (primaryError) {
    const codexRoot = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    const fallback = path.join(codexRoot, 'node_modules', 'playwright', 'index.mjs');
    if (fs.existsSync(fallback)) return import(pathToFileURL(fallback).href);
    throw new Error(
      `Playwright is unavailable. Tried the project dependency and ${fallback}.\n${primaryError}`
    );
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function evidenceGroups(clips) {
  const grouped = new Map();
  for (const clip of clips) {
    const key = clip.archetype === 'meyer'
      ? `${clip.archetype}:${clip.weapon}`
      : `${clip.archetype}:default`;
    const list = grouped.get(key) ?? [];
    list.push(clip);
    grouped.set(key, list);
  }

  return [...grouped.entries()].map(([key, entries]) => {
    const move = entries.find((clip) => clip.state === 'move');
    const attack = entries.find((clip) => clip.state === 'attack');
    const reaction = entries.find((clip) => clip.state === 'hitstun')
      ?? entries.find((clip) => clip.state === 'dead');
    const selected = [];
    for (const clip of [move, attack, reaction, ...entries]) {
      if (clip && !selected.some((candidate) => candidate.id === clip.id)) selected.push(clip);
      if (selected.length === 3) break;
    }
    const phone = attack ?? move ?? entries[0];
    return {
      key,
      label: key.replace(':default', '').replace(':', ' — '),
      desktopIds: selected.map((clip) => clip.id),
      phoneId: phone.id
    };
  });
}

const options = parseArgs(process.argv);
fs.mkdirSync(options.out, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: !options.headed,
  args: ['--use-gl=angle', '--use-angle=swiftshader']
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  serviceWorkers: 'block'
});
const page = await context.newPage();
page.setDefaultTimeout(options.timeoutMs);

const browserErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') {
    browserErrors.push({ type: 'console', text: message.text() });
  }
});
page.on('pageerror', (error) => {
  browserErrors.push({ type: 'page', text: String(error?.stack ?? error) });
});
page.on('requestfailed', (request) => {
  browserErrors.push({
    type: 'request',
    text: `${request.url()}: ${request.failure()?.errorText ?? 'request failed'}`
  });
});
page.on('response', (response) => {
  if (response.status() >= 400) {
    browserErrors.push({ type: 'response', text: `${response.status()} ${response.url()}` });
  }
});

const report = {
  generatedAt: new Date().toISOString(),
  url: options.url,
  outputDirectory: options.out,
  summary: {},
  readiness: null,
  visits: [],
  validations: [],
  evidence: [],
  browserErrors,
  fatalError: null
};

try {
  await page.goto(options.url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.galleryReady === 'true'
      || document.body.dataset.galleryReady === 'error',
    { timeout: options.timeoutMs }
  );

  const status = await page.evaluate(() => window.animationGallery?.status());
  assert(status, 'window.animationGallery was not installed.');
  assert(status.ready, `Gallery failed to become ready: ${status.error ?? 'unknown error'}`);
  report.readiness = status.readiness;
  assert(status.readiness.failedAssets === 0, `${status.readiness.failedAssets} assets failed.`);
  assert(status.readiness.pendingAssets === 0, `${status.readiness.pendingAssets} assets are pending.`);
  assert(
    status.readiness.loadedAssets === status.readiness.declaredAssets,
    `Loaded ${status.readiness.loadedAssets}/${status.readiness.declaredAssets} assets.`
  );

  const clips = await page.evaluate(() => window.animationGallery.listClips());
  assert(clips.length === status.readiness.readyClips, 'Ready clip list and catalog count differ.');

  let visitedFrames = 0;
  const visitedCues = new Set();
  for (const clip of clips) {
    const firstState = await page.evaluate((id) => window.animationGallery.selectClip(id), clip.id);
    assert(firstState.clipId === clip.id, `Could not select ${clip.id}.`);
    const frames = [];
    for (const frame of clip.frames) {
      const state = await page.evaluate(
        (frameIndex) => window.animationGallery.selectFrame(frameIndex),
        frame.frameIndex
      );
      assert(state.clipId === clip.id, `Selection left ${clip.id} while visiting its frames.`);
      assert(
        state.frameIndex === frame.frameIndex,
        `${clip.id} pose ${frame.frameIndex + 1} reported pose ${state.frameIndex + 1}.`
      );
      assert(
        state.cue === frame.cue,
        `${clip.id} pose ${frame.frameIndex + 1} reported cue ${state.cue}, expected ${frame.cue}.`
      );
      assert(frame.loaded, `${clip.id} pose ${frame.frameIndex + 1} did not load.`);
      assert(
        Number.isFinite(state.scaleCorrection) && state.scaleCorrection > 0,
        `${clip.id} has no valid scale correction.`
      );
      assert(
        Number.isFinite(state.phoneRenderHeightPx) && state.phoneRenderHeightPx > 0,
        `${clip.id} has no phone-scale render height.`
      );
      frames.push({
        frameIndex: state.frameIndex,
        cue: state.cue,
        scaleCorrection: state.scaleCorrection,
        phoneRenderHeightPx: state.phoneRenderHeightPx
      });
      visitedFrames += 1;
      visitedCues.add(state.cue);
    }

    const validation = await page.evaluate(
      (id) => window.animationGallery.validateClip(id),
      clip.id
    );
    report.validations.push(validation);
    assert(validation.ok, `${clip.id} validation failed: ${validation.errors.join(' ')}`);
    if (clip.playback === 'loop') {
      assert(validation.loopWraps === true, `${clip.id} does not wrap to its first pose.`);
    }
    if (clip.state === 'attack') {
      assert(
        validation.attackContactWithinActiveWindow === true,
        `${clip.id} shows contact outside its active window.`
      );
    }
    report.visits.push({ clipId: clip.id, playback: clip.playback, frames });
  }

  const groups = evidenceGroups(clips);
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const stem = `${String(index + 1).padStart(2, '0')}-${slug(group.key)}`;

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.evaluate(
      ({ ids, title }) => window.animationGallery.showGroup(ids, title),
      { ids: group.desktopIds, title: `${group.label} · desktop evidence` }
    );
    const desktopPath = path.join(options.out, `desktop-${stem}.png`);
    await page.screenshot({ path: desktopPath, type: 'png', fullPage: false });

    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(
      ({ id, title }) => window.animationGallery.showGroup([id], title),
      { id: group.phoneId, title: `${group.label} · 844 × 390 evidence` }
    );
    const phonePath = path.join(options.out, `phone-${stem}.png`);
    await page.screenshot({ path: phonePath, type: 'png', fullPage: false });

    report.evidence.push({
      group: group.key,
      desktop: { path: desktopPath, width: 1440, height: 1000, clipIds: group.desktopIds },
      phone: { path: phonePath, width: 844, height: 390, clipIds: [group.phoneId] }
    });
  }

  assert(browserErrors.length === 0, `Browser reported ${browserErrors.length} error(s).`);
  report.summary = {
    ok: true,
    readyClips: clips.length,
    visitedClips: report.visits.length,
    visitedFrames,
    visitedCues: [...visitedCues].sort(),
    loopClips: report.validations.filter((entry) => entry.loopWraps !== null).length,
    attackClips: report.validations.filter(
      (entry) => entry.attackContactWithinActiveWindow !== null
    ).length,
    desktopScreenshots: report.evidence.length,
    phoneScreenshots: report.evidence.length,
    browserErrors: browserErrors.length
  };
} catch (error) {
  report.fatalError = String(error?.stack ?? error);
  report.summary = { ok: false, browserErrors: browserErrors.length };
  process.exitCode = 1;
} finally {
  const reportPath = path.join(options.out, 'report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
  if (report.summary.ok) {
    console.log(
      `Animation gallery PASS: ${report.summary.visitedClips} clips, `
      + `${report.summary.visitedFrames} poses, ${report.summary.attackClips} attacks, `
      + `${report.summary.loopClips} loops.`
    );
    console.log(
      `Evidence: ${report.summary.desktopScreenshots} desktop + `
      + `${report.summary.phoneScreenshots} phone screenshots in ${options.out}`
    );
    console.log(`Report: ${reportPath}`);
  } else {
    console.error(`Animation gallery FAIL: ${report.fatalError ?? 'unknown failure'}`);
    console.error(`Report: ${reportPath}`);
  }
}
