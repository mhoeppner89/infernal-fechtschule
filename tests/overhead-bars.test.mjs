import test from 'node:test';
import assert from 'node:assert/strict';

import { createEnemy, createPlayer } from '../site/js/sim/factories.js';
import { ATTACKS, attackDuration } from '../site/js/sim/attacks.js';
import {
  actorBodyHeight,
  actorHeadRadius,
  bladeLengthFor,
  gripLengthFor,
  poseForActor
} from '../site/js/render/procedural-rig.js';

const ARCHETYPES = ['meyer', 'thug', 'spear', 'captain', 'wretch', 'grotesque'];

function actorFor(archetype) {
  return archetype === 'meyer'
    ? createPlayer(1, 0, 400, 420)
    : createEnemy(100 + ARCHETYPES.indexOf(archetype), archetype, 400, 420);
}

function snapshotFor(archetype, overrides = {}) {
  const actor = actorFor(archetype);
  return {
    ...actor,
    attackId: null,
    attackElapsed: 0,
    ...overrides
  };
}

function poseBounds(pose) {
  const points = [
    pose.hip,
    pose.chest,
    pose.neck,
    pose.frontShoulder,
    pose.rearShoulder,
    pose.frontHip,
    pose.rearHip,
    pose.frontKnee,
    pose.rearKnee,
    pose.frontFoot,
    pose.rearFoot,
    pose.frontElbow,
    pose.rearElbow,
    pose.frontHand,
    pose.rearHand,
    pose.supportHand,
    pose.blade.base,
    pose.blade.tip
  ];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs) - pose.headRadius,
    maxX: Math.max(...xs) + pose.headRadius,
    minY: Math.min(...ys, pose.head.y - pose.headRadius),
    maxY: Math.max(...ys, pose.head.y + pose.headRadius)
  };
}

function verticalBodySpan(pose) {
  return Math.max(pose.frontFoot.y, pose.rearFoot.y) - (pose.head.y - pose.headRadius);
}

function assertFinitePose(pose, label) {
  const bounds = poseBounds(pose);
  for (const value of Object.values(bounds)) assert.ok(Number.isFinite(value), `${label} bound is finite`);
  for (const point of [
    pose.hip,
    pose.chest,
    pose.head,
    pose.frontKnee,
    pose.rearKnee,
    pose.frontFoot,
    pose.rearFoot,
    pose.frontHand,
    pose.rearHand,
    pose.blade.base,
    pose.blade.tip
  ]) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), `${label} point is finite`);
  }
  assert.ok(bounds.maxY > bounds.minY, `${label} has a positive pose bound`);
}

test('every procedural archetype has a measurable body and head clearance', () => {
  const spans = new Map();
  for (const archetype of ARCHETYPES) {
    const bodyHeight = actorBodyHeight(archetype);
    const headRadius = actorHeadRadius(archetype);
    const pose = poseForActor(snapshotFor(archetype));
    const span = verticalBodySpan(pose);
    spans.set(archetype, span);

    assert.ok(bodyHeight > 0, `${archetype} has no procedural body height`);
    assert.equal(pose.bodyHeight, bodyHeight, `${archetype} pose uses its body height`);
    assert.equal(pose.headRadius, headRadius, `${archetype} pose uses its head radius`);
    assert.ok(span > headRadius * 3, `${archetype} head overlaps its feet`);
    assert.ok(span <= bodyHeight * 1.5, `${archetype} pose exceeds its body-height envelope`);
    assertFinitePose(pose, archetype);
  }

  assert.ok(actorBodyHeight('grotesque') > actorBodyHeight('meyer'));
  assert.ok(spans.get('grotesque') > spans.get('meyer'));
});

test('crouch changes the procedural head-to-foot bounds without losing the feet', () => {
  for (const archetype of ARCHETYPES) {
    const standing = poseForActor(snapshotFor(archetype));
    const crouched = poseForActor(snapshotFor(archetype, { state: 'crouch', stateElapsed: 0.1 }));
    assert.ok(crouched.head.y > standing.head.y, `${archetype} crouch lowers the head`);
    assert.ok(
      verticalBodySpan(crouched) < verticalBodySpan(standing),
      `${archetype} crouch compresses its overhead-bar span`
    );
    assert.ok(Math.max(crouched.frontFoot.y, crouched.rearFoot.y) >= -1, `${archetype} crouch keeps planted feet`);
  }
});

test('attack phases keep pose geometry finite and blade grip lengths fixed', () => {
  const archetype = 'meyer';
  const definition = ATTACKS.ls_l1;
  const phases = [
    ['anticipation', definition.startup * 0.5],
    ['contact', definition.startup + definition.active * 0.5],
    ['recovery', definition.startup + definition.active + definition.recovery * 0.5]
  ];
  const blades = [];
  for (const [phase, attackElapsed] of phases) {
    const pose = poseForActor(snapshotFor(archetype, {
      state: 'attack',
      attackId: 'ls_l1',
      attackElapsed,
      stateElapsed: attackElapsed,
      stateDuration: attackDuration(definition)
    }));
    assert.equal(pose.attack.phase, phase);
    assertFinitePose(pose, phase);
    assert.ok(Math.abs(pose.blade.length - bladeLengthFor('longsword')) < 1e-9, `${phase} blade length changed`);
    assert.ok(Math.abs(pose.blade.gripLength - gripLengthFor('longsword')) < 1e-9, `${phase} grip length changed`);
    blades.push(`${pose.blade.tip.x.toFixed(4)}:${pose.blade.tip.y.toFixed(4)}`);
  }
  assert.ok(new Set(blades).size > 1, 'attack phases do not move the procedural blade');
});
