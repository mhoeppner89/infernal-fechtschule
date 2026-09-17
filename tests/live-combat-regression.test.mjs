import test from 'node:test';
import assert from 'node:assert/strict';
import { GameWorld } from '../site/js/sim/world.js';
import { createEnemy } from '../site/js/sim/factories.js';
import { ATTACKS } from '../site/js/sim/attacks.js';
import { NEUTRAL_INPUT } from '../site/js/sim/types.js';
const dt = 1 / 60, input = overrides => ({ ...NEUTRAL_INPUT, ...overrides });
function fixture() {
  const w = new GameWorld({ playerCount: 1, seed: 12, skipCountdown: true });
  while (w.phase !== 'wave') w.step(dt, [input()]);
  w.spawnQueue = []; w.actors.splice(1);
  const p = w.actors[0]; p.x = 400; p.z = 420; p.facing = 1;
  const e = createEnemy(90, 'thug', 460, 420); e.aiCooldown = 100; e.health = 1000; w.actors.push(e);
  return { w, p, e };
}
test('two fresh Cut edges on adjacent simulation ticks both count', () => {
  for (const weapon of ['longsword', 'dussack']) {
    const { w, p } = fixture(); p.weapon = weapon;
    w.step(dt, [input({ lightPressed: true })]);
    w.step(dt, [input({ lightPressed: true })]);
    assert.equal(p.actionBuffer?.action, 'light');
    const seen = new Set();
    for (let i = 0; i < 40; i++) { w.step(dt, [input()]); seen.add(p.attack?.id); }
    assert.ok(seen.has(weapon === 'longsword' ? 'ls_l2' : 'ds_l2'));
  }
});
test('Guard pressed during an attack or reaction cannot arm a timed parry', () => {
  for (const state of ['attack', 'hitstun', 'guardbreak', 'dodge', 'switch']) {
    const { w, p } = fixture();
    if (state === 'attack') w.startAttack(p, 'ls_h');
    else { p.state = state; p.stateElapsed = 0; p.stateDuration = 1; }
    w.step(dt, [input({ guardPressed: true, guardHeld: true })]);
    assert.equal(p.parryWindow, 0, state);
  }
});
test('one timed parry cannot deflect two separate attackers', () => {
  const { w, p, e } = fixture();
  p.state = 'block'; p.parryWindow = .17;
  w.startAttack(e, 'thug_body', p);
  assert.equal(w.tryParryOrDeflect(e, p, ATTACKS.thug_body), true);
  assert.equal(p.parryWindow, 0);
  const other = createEnemy(91, 'thug', 460, 420); w.startAttack(other, 'thug_body', p);
  assert.equal(w.tryParryOrDeflect(other, p, ATTACKS.thug_body), false);
});
test('a tapped Guard remains available from neutral and rising cut targets the torso', () => {
  const { w, p } = fixture();
  w.step(dt, [input({ guardPressed: true })]);
  assert.ok(p.parryWindow > 0);
  assert.equal(ATTACKS.ls_guard_down.hitZone, 'torso');
  assert.ok(ATTACKS.ls_guard_back.minForward >= -12);
});
test('Guard commands entered while switching do not leak into the new weapon', () => {
  const { w, p, e } = fixture(); e.x = 1000;
  w.step(dt, [input({ switchPressed: true })]);
  w.step(dt, [input({ guardPressed: true, moveX: 1 })]);
  for (let i = 0; i < 22; i++) w.step(dt, [input()]);
  assert.equal(p.guardCommand, null);
  w.step(dt, [input({ lightPressed: true })]);
  assert.equal(p.attack?.id, 'ds_l1');
});
test('late crouch taps cannot turn into unintended standing attacks', () => {
  const { w, p, e } = fixture(); e.x = 1000;
  w.step(dt, [input({ mobilityPressed: true })]);
  for (let i = 0; i < 21; i++) w.step(dt, [input()]);
  w.step(dt, [input({ lightPressed: true })]);
  for (let i = 0; i < 10; i++) w.step(dt, [input()]);
  assert.equal(p.attack, null);
  assert.equal(p.actionBuffer, null);
});
test('a broken club resolves buffered follow-ups from the restored weapon kit', async () => {
  const { resolvePlayerAttack } = await import('../site/js/sim/attacks.js');
  assert.equal(resolvePlayerAttack('longsword', 'light', 'cl_l1', false), 'ls_l1');
  assert.equal(resolvePlayerAttack('dussack', 'heavy', 'cl_l1', false), 'ds_h');
});
