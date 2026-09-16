import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ATTACKS } from '../site/js/sim/attacks.js';
import { attackAnimationFrameIndex } from '../site/js/render/animation-catalog.js';
import { ANIMATION_MANIFEST } from '../site/js/render/animation-manifest.js';

const MAX_POSE_HOLD_SECONDS = 0.12;
const OVERSHOOT_HOLD_TICKS = 3;
const SETTLE_HOLD_TICKS = 7;
const POSE_HOLD_EPSILON = 1e-9;

function expectedRecoveryPoseCount(recoverySeconds) {
  let frameCount = 3;
  while (
    recoverySeconds * SETTLE_HOLD_TICKS
      / (OVERSHOOT_HOLD_TICKS + SETTLE_HOLD_TICKS * (frameCount - 1))
      > MAX_POSE_HOLD_SECONDS + POSE_HOLD_EPSILON
  ) frameCount += 1;
  return frameCount;
}

function assetPath(url) {
  return fileURLToPath(new URL(`../site/${url}`, import.meta.url));
}

function fileDigest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

test('every ready manifest frame URL resolves to a runtime asset', () => {
  let frameCount = 0;
  for (const clip of ANIMATION_MANIFEST) {
    if (clip.availability !== 'ready') continue;
    for (const frame of clip.frames) {
      frameCount += 1;
      assert.ok(existsSync(assetPath(frame.url)), `missing ${clip.id}: ${frame.url}`);
    }
  }
  assert.ok(frameCount > 0, 'manifest has no ready frame URLs to validate');
});

test('all attack recoveries have distinct timed pose tracks and complete assets', () => {
  const clips = ANIMATION_MANIFEST.filter(
    (clip) => clip.availability === 'ready' && clip.state === 'attack' && clip.attackId
  );
  assert.equal(clips.length, 35);

  for (const clip of clips) {
    const definition = ATTACKS[clip.attackId];
    assert.ok(definition, `missing attack definition for ${clip.id}`);

    if (clip.display.fixedScale) {
      assert.equal(clip.frames.length, 6, `${clip.id} fixed-rig frame count`);
      assert.deepEqual(
        clip.frames.map((frame) => frame.cue),
        ['neutral', 'anticipation', 'contact', 'overshoot', 'recovery', 'neutral'],
        `${clip.id} fixed-rig cue order`
      );
      for (const [index, frame] of clip.frames.entries()) {
        assert.match(frame.url, new RegExp(`/${String(index + 1).padStart(2, '0')}\\.webp$`));
        assert.ok(existsSync(assetPath(frame.url)), `missing ${frame.url}`);
      }

      const recoveryFrames = clip.frames.slice(3);
      const distinctRecoveryPoseCount = new Set(
        recoveryFrames.map((frame) => fileDigest(assetPath(frame.url)))
      ).size;
      assert.equal(
        distinctRecoveryPoseCount,
        recoveryFrames.length,
        `${clip.id} fixed-rig recovery poses must remain pixel-distinct`
      );

      const totalRecoveryTicks = recoveryFrames.reduce((sum, frame) => sum + frame.holdTicks, 0);
      let priorTicks = 0;
      for (const [recoveryIndex, frame] of recoveryFrames.entries()) {
        const effectiveHold = definition.recovery * frame.holdTicks / totalRecoveryTicks;
        if (clip.archetype === 'meyer') {
          assert.ok(
            effectiveHold <= 0.15,
            `${clip.id} player recovery pose holds ${(effectiveHold * 1000).toFixed(1)} ms`
          );
        }
        const phaseMidpoint = (priorTicks + frame.holdTicks / 2) / totalRecoveryTicks;
        const elapsed = definition.startup + definition.active + definition.recovery * phaseMidpoint;
        assert.equal(
          attackAnimationFrameIndex(clip, clip.attackId, elapsed),
          recoveryIndex + 3,
          `${clip.id} fixed-rig recovery frame selection ${recoveryIndex + 4}`
        );
        priorTicks += frame.holdTicks;
      }
    } else {
    const expectedRecoveryPoses = expectedRecoveryPoseCount(definition.recovery);
    const recoveryFrames = clip.frames.filter(
      (frame) => frame.cue === 'overshoot' || frame.cue === 'recovery'
    );

    assert.equal(recoveryFrames.length, expectedRecoveryPoses, `${clip.id} recovery count`);
    assert.equal(clip.frames.length, expectedRecoveryPoses + 3, `${clip.id} total frame count`);
    assert.equal(clip.frames[2].cue, 'contact', `${clip.id} contact key moved`);
    assert.equal(clip.frames[3].cue, 'overshoot', `${clip.id} has no immediate overshoot key`);
    assert.match(clip.frames[3].url, /\/05\.webp$/);
    assert.equal(clip.frames[4].cue, 'recovery', `${clip.id} authored recovery key moved`);
    assert.match(clip.frames[4].url, /\/04\.webp$/);

    const totalRecoveryTicks = recoveryFrames.reduce((sum, frame) => sum + frame.holdTicks, 0);
    const playbackFrameNumbers = [5, 4, ...Array.from(
      { length: expectedRecoveryPoses - 2 },
      (_, index) => index + 6
    )];
    let priorTicks = 0;
    for (const [recoveryIndex, frame] of recoveryFrames.entries()) {
      const effectiveHold = definition.recovery * frame.holdTicks / totalRecoveryTicks;
      assert.ok(
        effectiveHold <= MAX_POSE_HOLD_SECONDS + 1e-9,
        `${clip.id} frame ${recoveryIndex + 4} holds ${(effectiveHold * 1000).toFixed(1)} ms`
      );

      const phaseMidpoint = (priorTicks + frame.holdTicks / 2) / totalRecoveryTicks;
      const elapsed = definition.startup + definition.active + definition.recovery * phaseMidpoint;
      assert.equal(
        attackAnimationFrameIndex(clip, clip.attackId, elapsed),
        recoveryIndex + 3,
        `${clip.id} recovery frame selection ${recoveryIndex + 4}`
      );
      priorTicks += frame.holdTicks;

      const expectedFrameNumber = playbackFrameNumbers[recoveryIndex];
      assert.match(frame.url, new RegExp(`/${String(expectedFrameNumber).padStart(2, '0')}\\.webp$`));
      const runtimePath = assetPath(frame.url);
      const sourcePath = runtimePath.replace(/\.webp$/, '.png');
      assert.ok(existsSync(runtimePath), `missing ${frame.url}`);
      assert.ok(existsSync(sourcePath), `missing source PNG for ${frame.url}`);
    }

    const distinctRecoveryPoseCount = new Set(
      recoveryFrames.map((frame) => fileDigest(assetPath(frame.url).replace(/\.webp$/, '.png')))
    ).size;
    assert.equal(
      distinctRecoveryPoseCount,
      recoveryFrames.length,
      `${clip.id} recovery poses must remain pixel-distinct`
    );
    if (definition.recovery > 0.25) {
      assert.ok(
        distinctRecoveryPoseCount >= 2,
        `${clip.id} needs at least two distinct recovery poses`
      );
    }
    if (definition.recovery > 0.5) {
      assert.ok(
        distinctRecoveryPoseCount >= 3,
        `${clip.id} needs at least three distinct recovery poses`
      );
    }
    }

    const activeEndSeconds = definition.startup + definition.active;
    const attackDuration = activeEndSeconds + definition.recovery;
    for (let milliseconds = 0; milliseconds <= Math.ceil(attackDuration * 1000); milliseconds += 1) {
      const elapsed = milliseconds / 1000;
      const frame = clip.frames[attackAnimationFrameIndex(clip, clip.attackId, elapsed)];
      const contactIsExpected = elapsed >= definition.startup && elapsed < activeEndSeconds;
      assert.equal(
        frame?.cue === 'contact',
        contactIsExpected,
        `${clip.id} contact escaped active window at ${elapsed.toFixed(3)}s`
      );
    }
  }
});
