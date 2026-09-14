import test from 'node:test';
import assert from 'node:assert/strict';

import { ATTACKS } from '../site/js/sim/attacks.js';
import {
  animationTransitionSpec,
  attackAnimationFrameIndex
} from '../site/js/render/animation-catalog.js';
import { ANIMATION_MANIFEST } from '../site/js/render/animation-manifest.js';

function resolved(clip, frameIndex) {
  return {
    clip,
    frame: clip.frames[frameIndex],
    frameIndex,
    image: {},
    scaleCorrection: 1
  };
}

test('all authored attacks keep contact poses inside the active hit window', () => {
  const attacks = ANIMATION_MANIFEST.filter(
    (clip) => clip.availability === 'ready' && clip.state === 'attack' && clip.attackId
  );
  assert.ok(attacks.length > 0);

  for (const clip of attacks) {
    const definition = ATTACKS[clip.attackId];
    assert.ok(definition, `missing attack definition for ${clip.id}`);

    const beforeActive = attackAnimationFrameIndex(
      clip,
      clip.attackId,
      Math.max(0, definition.startup - 0.000001)
    );
    const activeStart = attackAnimationFrameIndex(clip, clip.attackId, definition.startup);
    const activeEnd = attackAnimationFrameIndex(
      clip,
      clip.attackId,
      definition.startup + definition.active - 0.000001
    );
    const recoveryStart = attackAnimationFrameIndex(
      clip,
      clip.attackId,
      definition.startup + definition.active
    );

    assert.notEqual(clip.frames[beforeActive].cue, 'contact', `${clip.id} contacts during startup`);
    assert.equal(clip.frames[activeStart].cue, 'contact', `${clip.id} misses active start`);
    assert.equal(clip.frames[activeEnd].cue, 'contact', `${clip.id} leaves contact early`);
    assert.notEqual(clip.frames[recoveryStart].cue, 'contact', `${clip.id} contacts during recovery`);
  }
});

test('pose transitions smooth loops and combos without blending contact frames', () => {
  const idle = ANIMATION_MANIFEST.find(
    (clip) => clip.availability === 'ready' && clip.state === 'idle' && clip.frames.length > 1
  );
  const attackClips = ANIMATION_MANIFEST.filter(
    (clip) => clip.availability === 'ready' && clip.state === 'attack'
  );
  const firstAttack = attackClips[0];
  const secondAttack = attackClips.find(
    (clip) => clip.archetype === firstAttack?.archetype && clip.id !== firstAttack.id
  );
  assert.ok(idle && firstAttack && secondAttack);

  const loopBlend = animationTransitionSpec(resolved(idle, 0), resolved(idle, 1));
  assert.ok(loopBlend.duration > 0 && loopBlend.duration <= 0.06);
  assert.ok(loopBlend.previousOpacity > 0 && loopBlend.previousOpacity <= 0.3);

  const contactIndex = firstAttack.frames.findIndex((frame) => frame.cue === 'contact');
  const anticipationIndex = firstAttack.frames.findIndex((frame) => frame.cue === 'anticipation');
  const recoveryIndex = firstAttack.frames.findIndex((frame) => frame.cue === 'recovery');
  const nextAnticipationIndex = secondAttack.frames.findIndex((frame) => frame.cue === 'anticipation');
  assert.ok(contactIndex >= 0 && anticipationIndex >= 0 && recoveryIndex >= 0 && nextAnticipationIndex >= 0);

  assert.deepEqual(
    animationTransitionSpec(
      resolved(firstAttack, anticipationIndex),
      resolved(firstAttack, contactIndex)
    ),
    { duration: 0, previousOpacity: 0 }
  );

  const recoveryBlend = animationTransitionSpec(
    resolved(firstAttack, contactIndex),
    resolved(firstAttack, recoveryIndex)
  );
  assert.ok(recoveryBlend.duration > 0 && recoveryBlend.duration <= 0.025);

  const comboBlend = animationTransitionSpec(
    resolved(firstAttack, recoveryIndex),
    resolved(secondAttack, nextAnticipationIndex)
  );
  assert.ok(comboBlend.duration > 0 && comboBlend.duration <= 0.035);
  assert.ok(comboBlend.previousOpacity <= 0.24);
});
