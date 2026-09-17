import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const compiledRoot = process.env.PROCEDURAL_RENDERER_BUILD_ROOT
  ? path.resolve(process.env.PROCEDURAL_RENDERER_BUILD_ROOT)
  : path.join(root, 'site', 'js');
const rig = await import(pathToFileURL(path.join(compiledRoot, 'render', 'procedural-rig.js')).href);

function actor(overrides = {}) {
  return {
    id: 7,
    team: 'players',
    archetype: 'meyer',
    name: 'Meyer',
    playerIndex: 0,
    x: 540,
    z: 430,
    vx: 0,
    vz: 0,
    facing: 1,
    radius: 22,
    health: 100,
    maxHealth: 100,
    guard: 100,
    maxGuard: 100,
    armor: 0,
    maxArmor: 0,
    state: 'idle',
    stateElapsed: 0.18,
    stateDuration: 0.8,
    stateMoveX: 0,
    stateMoveZ: 0,
    weapon: 'longsword',
    desiredWeapon: 'longsword',
    stowedWeapon: 'dussack',
    durability: 0,
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

function finitePoint(value) {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function length(left, right) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

test('analytic IK keeps both bones finite and at their authored lengths', () => {
  const root = { x: 12, y: -30 };
  const target = { x: 48, y: -54 };
  const solved = rig.solveTwoBoneIK(root, target, 31, 29, -1);
  assert.ok(finitePoint(solved.elbow));
  assert.ok(finitePoint(solved.end));
  assert.ok(Math.abs(length(solved.root, solved.elbow) - 31) < 0.01);
  assert.ok(Math.abs(length(solved.elbow, solved.end) - 29) < 0.01);
  assert.ok(length(solved.root, solved.end) <= 60.001);
});

test('every articulated state produces finite geometry for the complete cast', () => {
  const states = [
    ['idle', null],
    ['move', null],
    ['block', null],
    ['attack', 'ls_l1'],
    ['dodge', null],
    ['crouch', null],
    ['jump', null],
    ['switch', 'ls_switch_in'],
    ['hitstun', null],
    ['guardbreak', null],
    ['dead', null]
  ];
  const archetypes = ['meyer', 'thug', 'spear', 'captain', 'wretch', 'grotesque'];
  for (const archetype of archetypes) {
    for (const [state, attackId] of states) {
      const weapon = archetype === 'spear' ? 'spear' : archetype === 'thug' ? 'club' : 'longsword';
      const pose = rig.poseForActor(actor({ archetype, state, weapon, desiredWeapon: weapon, attackId }));
      for (const [name, value] of Object.entries(pose)) {
        if (value && typeof value === 'object' && 'x' in value) {
          assert.ok(finitePoint(value), `${archetype}/${state}/${name}`);
        }
      }
      assert.ok(Number.isFinite(pose.scale));
      assert.ok(Number.isFinite(pose.attack.progress));
      assert.ok(Number.isFinite(pose.blade.length));
      assert.ok(Math.abs(length(pose.blade.base, pose.blade.tip) - pose.blade.length) < 0.01);
    }
  }
});

test('two-handed weapons preserve fixed grip spans and weapon-specific blade lengths', () => {
  for (const weapon of ['longsword', 'spear']) {
    const pose = rig.poseForActor(actor({ weapon, desiredWeapon: weapon, attackId: weapon === 'spear' ? 'sp_l1' : 'ls_l3', state: 'attack', attackElapsed: 0.22 }));
    assert.equal(pose.twoHanded, true);
    assert.ok(Math.abs(length(pose.frontHand, pose.rearHand) - rig.gripLengthFor(weapon)) < 0.01);
    assert.ok(Math.abs(length(pose.blade.base, pose.blade.tip) - rig.bladeLengthFor(weapon)) < 0.01);
  }
  assert.ok(rig.bladeLengthFor('spear') > rig.bladeLengthFor('longsword'));
  assert.ok(rig.bladeLengthFor('longsword') > rig.bladeLengthFor('dussack'));
});

test('unknown attack ids receive a finite definition-driven fallback motion', () => {
  const motion = rig.attackMotionFor(actor({ state: 'attack', attackId: 'combat-agent-future-cut', attackElapsed: 0.3 }));
  assert.equal(motion.definition, null);
  assert.ok(['anticipation', 'contact', 'recovery'].includes(motion.phase));
  assert.ok(Number.isFinite(motion.angle));
  assert.ok(Number.isFinite(motion.speed));
  const pose = rig.poseForActor(actor({ state: 'attack', attackId: 'combat-agent-future-cut' }));
  assert.ok(pose.bladeTrail.length >= 0);
});

test('renderer source has no external raster dependency or per-frame image creation', async () => {
  const files = [
    path.join(root, 'src', 'render', 'canvas-renderer.ts'),
    path.join(root, 'src', 'render', 'procedural-rig.ts'),
    path.join(root, 'src', 'render', 'procedural-scene.ts')
  ];
  const source = await Promise.all(files.map((file) => readFile(file, 'utf8'))).then((parts) => parts.join('\n'));
  assert.doesNotMatch(source, /new\s+Image\s*\(/);
  assert.doesNotMatch(source, /HTMLImageElement/);
  assert.doesNotMatch(source, /\.src\s*=/);
  assert.match(source, /OffscreenCanvas/);
  assert.match(source, /drawImage\(surface/);
});
