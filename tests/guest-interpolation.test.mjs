import test from 'node:test';
import assert from 'node:assert/strict';

import { interpolateGuestSnapshot } from '../site/js/app/controller.js';

function actor(overrides = {}) {
  return {
    id: 1,
    team: 'players',
    archetype: 'meyer',
    name: 'Meyer',
    playerIndex: 1,
    x: 100,
    z: 200,
    vx: 120,
    vz: 60,
    facing: 1,
    radius: 24,
    health: 100,
    maxHealth: 100,
    guard: 80,
    maxGuard: 80,
    armor: 0,
    maxArmor: 0,
    state: 'move',
    stateElapsed: 1,
    stateDuration: 0,
    stateMoveX: 0,
    stateMoveZ: 0,
    weapon: 'longsword',
    desiredWeapon: 'longsword',
    attackId: null,
    attackElapsed: 0,
    reactionZone: null,
    invulnerable: 0,
    openingTimer: 0,
    provokeTimer: 0,
    counterWindow: 0,
    flashTimer: 0,
    comboCount: 0,
    deathTimer: 0,
    ...overrides
  };
}

function snapshot(tick, time, actorSnapshot) {
  return {
    version: 4,
    tick,
    time,
    phase: 'wave',
    waveIndex: 0,
    waveTitle: 'Roadside Ambush',
    score: 0,
    bossPhase: 0,
    lessons: [],
    offeredLessons: [],
    actors: [actorSnapshot],
    cameraX: 0,
    stageWidth: 1280
  };
}

test('guest presentation interpolates movement but never extrapolates attack clocks', () => {
  const previous = snapshot(60, 1, actor());
  const latest = snapshot(63, 1.05, actor({ x: 160, z: 230, stateElapsed: 1.05 }));
  const previousCopy = structuredClone(previous);
  const latestCopy = structuredClone(latest);

  const halfway = interpolateGuestSnapshot(previous, latest, 0.025, 0.05);
  assert.equal(halfway.actors[0].x, 130);
  assert.equal(halfway.actors[0].z, 215);
  assert.ok(Math.abs(halfway.actors[0].stateElapsed - 1.025) < 1e-9);

  const afterJitter = interpolateGuestSnapshot(previous, latest, 0.08, 0.05);
  assert.equal(afterJitter.actors[0].x, 160);
  assert.ok(Math.abs(afterJitter.actors[0].stateElapsed - 1.08) < 1e-9);

  const attackPrevious = snapshot(120, 2, actor({
    state: 'attack',
    stateElapsed: 0.1,
    stateDuration: 0.5,
    attackId: 'ls_l1',
    attackElapsed: 0.1
  }));
  const attackLatest = snapshot(123, 2.05, actor({
    x: 112,
    state: 'attack',
    stateElapsed: 0.15,
    stateDuration: 0.5,
    attackId: 'ls_l1',
    attackElapsed: 0.15
  }));
  const attackHalfway = interpolateGuestSnapshot(attackPrevious, attackLatest, 0.025, 0.05);
  assert.ok(Math.abs(attackHalfway.actors[0].attackElapsed - 0.125) < 1e-9);
  const attackAfterJitter = interpolateGuestSnapshot(attackPrevious, attackLatest, 0.1, 0.05);
  assert.equal(attackAfterJitter.actors[0].attackElapsed, 0.15);

  const attackEntry = snapshot(66, 1.1, actor({
    state: 'attack',
    stateElapsed: 0.05,
    stateDuration: 0.5,
    attackId: 'ls_l1',
    attackElapsed: 0.05
  }));
  assert.equal(interpolateGuestSnapshot(latest, attackEntry, 0.025, 0.05).actors[0].state, 'move');
  assert.equal(interpolateGuestSnapshot(latest, attackEntry, 0.05, 0.05).actors[0].state, 'attack');

  const headReaction = snapshot(180, 3, actor({
    state: 'hitstun',
    stateElapsed: 0.04,
    stateDuration: 0.3,
    reactionZone: 'head'
  }));
  const legReaction = snapshot(183, 3.05, actor({
    state: 'hitstun',
    stateElapsed: 0.09,
    stateDuration: 0.3,
    reactionZone: 'legs'
  }));
  const reactionHalfway = interpolateGuestSnapshot(headReaction, legReaction, 0.025, 0.05);
  assert.equal(reactionHalfway.actors[0].reactionZone, 'head');
  assert.equal(reactionHalfway.actors[0].stateElapsed, 0.04);
  assert.equal(interpolateGuestSnapshot(headReaction, legReaction, 0.05, 0.05).actors[0].reactionZone, 'legs');

  assert.deepEqual(previous, previousCopy);
  assert.deepEqual(latest, latestCopy);
});
