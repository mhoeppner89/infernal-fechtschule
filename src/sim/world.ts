import {
  attackDuration,
  getAttack,
  isAttackActive,
  resolveAirAttack,
  resolveDodgeAttack,
  resolvePlayerAttack,
  resolveSwitchAttack,
  withUpgradeEffects
} from './attacks.js';
import { createEnemy, createPlayer } from './factories.js';
import { clamp, damp, normalize2 } from './math.js';
import { Rng } from './rng.js';
import { chooseSoftTarget } from './targeting.js';
import { UPGRADE_OFFERS } from './upgrades.js';
import { WAVES } from './waves.js';
import type {
  Actor,
  ActorSnapshot,
  Archetype,
  AttackDefinition,
  GameEvent,
  GamePhase,
  GameSnapshot,
  InputFrame,
  UpgradeId,
  WorldOptions
} from './types.js';
import { NEUTRAL_INPUT } from './types.js';

export const ARENA = Object.freeze({
  minX: 92,
  maxX: 1188,
  minZ: 248,
  maxZ: 612
});

interface SpawnEntry {
  at: number;
  archetype: Exclude<Archetype, 'meyer'>;
}

export class GameWorld {
  readonly actors: Actor[] = [];
  readonly upgrades = new Set<UpgradeId>();

  phase: GamePhase = 'title';
  waveIndex = -1;
  waveTitle = '';
  score = 0;
  bossPhase = 0;
  tick = 0;
  time = 0;
  offeredUpgrades: UpgradeId[] = [];

  private readonly rng: Rng;
  private readonly playerCount: 1 | 2;
  private readonly events: GameEvent[] = [];
  private nextActorId = 1;
  private countdownTimer = 0;
  private spawnClock = 0;
  private spawnQueue: SpawnEntry[] = [];
  private permissionTimer = 0;
  private clearTimer = 0;
  private hitStop = 0;
  private waveResolved = false;
  private upgradeOfferIndex = 0;

  constructor(options: WorldOptions) {
    this.playerCount = options.playerCount;
    this.rng = new Rng(options.seed);

    const centreX = 400;
    for (let index = 0; index < options.playerCount; index += 1) {
      this.actors.push(createPlayer(
        this.nextActorId++,
        index,
        centreX - index * 64,
        420 + index * 54
      ));
    }

    this.phase = 'countdown';
    this.waveTitle = 'Meyer Crosses the Alps';
    this.countdownTimer = options.skipCountdown ? 0.05 : 1.25;
    this.emit({ type: 'banner', text: 'Meyer Crosses the Alps' });
  }

  step(dt: number, inputs: readonly InputFrame[]): void {
    const safeDt = clamp(dt, 0, 1 / 20);
    this.tick += 1;

    if (this.phase === 'countdown') {
      this.countdownTimer -= safeDt;
      if (this.countdownTimer <= 0) this.beginWave(0);
      return;
    }

    if (this.phase !== 'wave') return;

    if (this.hitStop > 0) {
      this.hitStop -= safeDt;
      return;
    }

    this.time += safeDt;
    this.updateSpawns(safeDt);
    this.updatePermissions(safeDt);
    this.updateActorTimers(safeDt);

    const players = this.playerActors();
    for (const player of players) {
      const input = inputs[player.playerIndex ?? 0] ?? NEUTRAL_INPUT;
      this.updatePlayer(player, input, safeDt);
    }

    for (const actor of this.actors) {
      if (actor.team === 'enemies') this.updateEnemy(actor, safeDt);
    }

    this.processAttackHits();
    this.resolveSeparation();
    this.cleanupActors();
    this.checkWaveResolution(safeDt);
    this.checkDefeat();
  }

  chooseUpgrade(id: UpgradeId): boolean {
    if (this.phase !== 'upgrade' || !this.offeredUpgrades.includes(id)) return false;
    this.upgrades.add(id);
    this.offeredUpgrades = [];
    this.emit({ type: 'upgrade-chosen', text: id });
    this.beginWave(this.waveIndex + 1);
    return true;
  }

  restart(): GameWorld {
    return new GameWorld({ playerCount: this.playerCount, seed: this.rng.integer(1, 0x7fffffff) });
  }

  consumeEvents(): GameEvent[] {
    return this.events.splice(0, this.events.length);
  }

  snapshot(): GameSnapshot {
    return {
      version: 1,
      tick: this.tick,
      time: this.time,
      phase: this.phase,
      waveIndex: this.waveIndex,
      waveTitle: this.waveTitle,
      score: this.score,
      bossPhase: this.bossPhase,
      upgrades: [...this.upgrades],
      offeredUpgrades: [...this.offeredUpgrades],
      actors: this.actors.map((actor) => this.actorSnapshot(actor))
    };
  }

  private actorSnapshot(actor: Actor): ActorSnapshot {
    return {
      id: actor.id,
      team: actor.team,
      archetype: actor.archetype,
      name: actor.name,
      playerIndex: actor.playerIndex,
      x: actor.x,
      z: actor.z,
      vx: actor.vx,
      vz: actor.vz,
      facing: actor.facing,
      radius: actor.radius,
      health: actor.health,
      maxHealth: actor.maxHealth,
      guard: actor.guard,
      maxGuard: actor.maxGuard,
      armor: actor.armor,
      maxArmor: actor.maxArmor,
      state: actor.state,
      stateElapsed: actor.stateElapsed,
      stateDuration: actor.stateDuration,
      weapon: actor.weapon,
      attackId: actor.attack?.id ?? null,
      attackElapsed: actor.attack?.elapsed ?? 0,
      invulnerable: actor.invulnerable,
      openingTimer: actor.openingTimer,
      provokeTimer: actor.provokeTimer,
      counterWindow: actor.counterWindow,
      flashTimer: actor.flashTimer,
      comboCount: actor.comboCount
    };
  }

  private updateActorTimers(dt: number): void {
    for (const actor of this.actors) {
      actor.invulnerable = Math.max(0, actor.invulnerable - dt);
      actor.parryWindow = Math.max(0, actor.parryWindow - dt);
      actor.openingTimer = Math.max(0, actor.openingTimer - dt);
      actor.provokeTimer = Math.max(0, actor.provokeTimer - dt);
      actor.counterWindow = Math.max(0, actor.counterWindow - dt);
      actor.flashTimer = Math.max(0, actor.flashTimer - dt);
      actor.guardRegenDelay = Math.max(0, actor.guardRegenDelay - dt);
      actor.aiCooldown = Math.max(0, actor.aiCooldown - dt);
      actor.aiThink = Math.max(0, actor.aiThink - dt);

      if (
        actor.guardRegenDelay <= 0 &&
        actor.state !== 'block' &&
        actor.state !== 'guardbreak' &&
        actor.guard < actor.maxGuard
      ) {
        const rate = actor.team === 'players' ? 18 : 11;
        actor.guard = Math.min(actor.maxGuard, actor.guard + rate * dt);
      }

      if (actor.state === 'dead') actor.deathTimer += dt;
    }
  }

  private updatePlayer(actor: Actor, input: InputFrame, dt: number): void {
    actor.lastInput = { ...input };
    if (actor.state === 'dead') return;

    if (input.guardPressed) actor.parryWindow = 0.17;

    if (actor.state === 'hitstun' || actor.state === 'guardbreak') {
      actor.stateElapsed += dt;
      actor.x += actor.vx * dt;
      actor.z += actor.vz * dt;
      actor.vx = damp(actor.vx, 0, 11, dt);
      actor.vz = damp(actor.vz, 0, 11, dt);
      this.clampActor(actor);
      if (actor.stateElapsed >= actor.stateDuration) {
        if (actor.state === 'guardbreak') actor.guard = actor.maxGuard * 0.34;
        this.enterNeutral(actor);
      }
      return;
    }

    if (actor.state === 'attack') {
      this.updatePlayerAttack(actor, input, dt);
      return;
    }

    if (actor.state === 'switch') {
      actor.stateElapsed += dt;
      if (actor.stateElapsed >= actor.stateDuration) {
        actor.weapon = actor.desiredWeapon;
        this.emit({ type: 'weapon-switch', actorId: actor.id, x: actor.x, z: actor.z, text: actor.weapon });
        const shouldEnter = actor.stateMoveX > 0.5;
        actor.stateMoveX = 0;
        if (shouldEnter) this.startAttack(actor, resolveSwitchAttack(actor.weapon));
        else this.enterNeutral(actor);
      }
      return;
    }

    if (actor.state === 'dodge') {
      actor.stateElapsed += dt;
      const remaining = 1 - actor.stateElapsed / actor.stateDuration;
      actor.x += actor.stateMoveX * 470 * Math.max(0.35, remaining) * dt;
      actor.z += actor.stateMoveZ * 330 * Math.max(0.35, remaining) * dt;
      this.clampActor(actor);
      if (input.lightPressed && actor.stateElapsed > 0.045 && actor.stateElapsed < 0.22) {
        this.startAttack(actor, resolveDodgeAttack(actor.weapon));
        if (actor.weapon === 'dussack' && this.upgrades.has('dussack-passing-step')) actor.invulnerable = 0.24;
        return;
      }
      if (actor.stateElapsed >= actor.stateDuration) this.enterNeutral(actor);
      return;
    }

    if (actor.state === 'jump') {
      actor.stateElapsed += dt;
      this.moveActor(actor, input.moveX, input.moveZ, 0.58, dt);
      if (input.lightPressed && actor.stateElapsed > 0.08) {
        this.startAttack(actor, resolveAirAttack(actor.weapon));
        return;
      }
      if (actor.stateElapsed >= actor.stateDuration) this.enterNeutral(actor);
      return;
    }

    if (actor.state === 'block') {
      actor.stateElapsed += dt;
      if (!input.guardHeld || actor.guard <= 0) {
        this.enterNeutral(actor);
      } else {
        this.moveActor(actor, input.moveX, input.moveZ, 0.31, dt);
      }
      return;
    }

    if (input.switchPressed) {
      this.startSwitch(actor, false);
      return;
    }

    if (input.mobilityPressed) {
      const direction = normalize2(input.moveX, input.moveZ);
      if (Math.hypot(direction.x, direction.y) > 0.15) this.startDodge(actor, direction.x, direction.y);
      else this.startJump(actor);
      return;
    }

    if (input.guardHeld) {
      actor.state = 'block';
      actor.stateElapsed = 0;
      actor.stateDuration = Number.POSITIVE_INFINITY;
      actor.vx = 0;
      actor.vz = 0;
      return;
    }

    if (input.lightPressed || input.heavyPressed) {
      const action = input.lightPressed ? 'light' : 'heavy';
      const id = resolvePlayerAttack(actor.weapon, action, null, actor.counterWindow > 0);
      if (action === 'heavy' && actor.counterWindow > 0) actor.counterWindow = 0;
      this.startAttack(actor, id);
      return;
    }

    this.moveActor(actor, input.moveX, input.moveZ, 1, dt);
    actor.state = Math.hypot(input.moveX, input.moveZ) > 0.1 ? 'move' : 'idle';
    actor.stateElapsed += dt;
  }

  private updatePlayerAttack(actor: Actor, input: InputFrame, dt: number): void {
    const runtime = actor.attack;
    if (!runtime) {
      this.enterNeutral(actor);
      return;
    }
    const definition = withUpgradeEffects(getAttack(runtime.id), this.upgrades);

    runtime.elapsed += dt;
    actor.stateElapsed = runtime.elapsed;

    if (runtime.elapsed < definition.startup) {
      const target = runtime.targetId === null ? null : this.actors.find((candidate) => candidate.id === runtime.targetId);
      if (target && target.state !== 'dead') {
        const depthError = target.z - actor.z;
        actor.z += clamp(depthError, -92 * dt, 92 * dt);
        if (Math.abs(target.x - actor.x) > 6) actor.facing = target.x >= actor.x ? 1 : -1;
      }
    }

    const motionDuration = Math.max(0.01, definition.startup + definition.active);
    if (runtime.elapsed <= motionDuration) {
      actor.x += actor.facing * (definition.movement / motionDuration) * dt;
    }
    this.clampActor(actor);

    const queueOpen = runtime.elapsed >= definition.startup * 0.45;
    if (queueOpen) {
      if (input.lightPressed) runtime.queuedAction = 'light';
      else if (input.heavyPressed) runtime.queuedAction = 'heavy';
      else if (input.switchPressed && runtime.hitConfirmed) runtime.queuedAction = 'switch';
    }

    if (
      runtime.blocked &&
      definition.provoke &&
      this.upgrades.has('second-intention') &&
      input.guardHeld &&
      runtime.elapsed >= definition.startup + definition.active
    ) {
      actor.attack = null;
      actor.state = 'block';
      actor.stateElapsed = 0;
      actor.stateDuration = Number.POSITIVE_INFINITY;
      return;
    }

    if (runtime.elapsed < attackDuration(definition)) return;

    const queued = runtime.queuedAction;
    const hitConfirmed = runtime.hitConfirmed;
    const currentId = runtime.id;
    actor.attack = null;

    if (queued === 'switch') {
      this.startSwitch(actor, hitConfirmed);
      return;
    }

    if (queued === 'light' || queued === 'heavy') {
      const next = resolvePlayerAttack(actor.weapon, queued, currentId, actor.counterWindow > 0);
      if (queued === 'heavy' && actor.counterWindow > 0) actor.counterWindow = 0;
      this.startAttack(actor, next);
      return;
    }

    actor.comboCount = 0;
    this.enterNeutral(actor);
  }

  private updateEnemy(actor: Actor, dt: number): void {
    if (actor.state === 'dead') return;

    if (actor.state === 'hitstun' || actor.state === 'guardbreak') {
      actor.stateElapsed += dt;
      actor.x += actor.vx * dt;
      actor.z += actor.vz * dt;
      actor.vx = damp(actor.vx, 0, 10, dt);
      actor.vz = damp(actor.vz, 0, 10, dt);
      this.clampActor(actor);
      if (actor.stateElapsed >= actor.stateDuration) {
        if (actor.state === 'guardbreak') actor.guard = actor.maxGuard * 0.3;
        this.enterNeutral(actor);
      }
      return;
    }

    if (actor.state === 'attack') {
      this.updateEnemyAttack(actor, dt);
      return;
    }

    if (actor.state === 'block') {
      actor.stateElapsed += dt;
      if (actor.stateElapsed >= actor.stateDuration) this.enterNeutral(actor);
      return;
    }

    const target = this.nearestLivingPlayer(actor);
    if (!target) return;
    actor.facing = target.x >= actor.x ? 1 : -1;

    if (actor.archetype === 'grotesque') {
      this.updateBossAI(actor, target, dt);
      return;
    }

    const dx = target.x - actor.x;
    const dz = target.z - actor.z;
    const forward = Math.abs(dx);
    const depth = Math.abs(dz);

    if (actor.archetype === 'captain' && actor.aiThink <= 0) {
      actor.aiThink = this.rng.range(0.28, 0.55);
      if (target.state === 'attack' && forward < 128 && depth < 48 && this.rng.next() < 0.55) {
        actor.state = 'block';
        actor.stateElapsed = 0;
        actor.stateDuration = this.rng.range(0.36, 0.68);
        actor.parryWindow = this.rng.next() < 0.25 ? 0.13 : 0;
        return;
      }
    }

    if (actor.attackPermission && actor.aiCooldown <= 0) {
      if (actor.archetype === 'thug' && forward < 67 && depth < 35) {
        this.startAttack(actor, 'thug_overhead', target);
        actor.aiCooldown = this.rng.range(0.65, 1.1);
        return;
      }
      if (actor.archetype === 'wretch' && forward < 72 && depth < 44) {
        this.startAttack(actor, 'wretch_claw', target);
        actor.aiCooldown = this.rng.range(0.45, 0.8);
        return;
      }
      if (actor.archetype === 'spear' && forward > 70 && forward < 164 && depth < 27) {
        this.startAttack(actor, 'spear_thrust', target);
        actor.aiCooldown = this.rng.range(1.0, 1.35);
        return;
      }
      if (actor.archetype === 'captain' && forward < 92 && depth < 39) {
        this.startAttack(actor, this.rng.next() < 0.35 ? 'captain_bash' : 'captain_cut', target);
        actor.aiCooldown = this.rng.range(0.8, 1.2);
        return;
      }
    }

    let desiredX = target.x;
    let desiredZ = target.z;
    if (!actor.attackPermission) {
      desiredX = target.x - actor.facing * (actor.archetype === 'spear' ? 148 : 96);
      desiredZ = target.z + actor.aiStrafeSign * (72 + (actor.id % 3) * 24);
    } else if (actor.archetype === 'spear') {
      desiredX = target.x - actor.facing * 126;
      desiredZ = target.z;
    } else {
      desiredX = target.x - actor.facing * 52;
    }

    const move = normalize2(desiredX - actor.x, desiredZ - actor.z);
    const speedScale = actor.attackPermission ? 1 : 0.72;
    this.moveActor(actor, move.x, move.y, speedScale, dt);
    actor.state = 'move';
  }

  private updateBossAI(actor: Actor, target: Actor, dt: number): void {
    const healthRatio = actor.health / actor.maxHealth;
    if (healthRatio <= 0.5 && this.bossPhase < 2) {
      this.bossPhase = 2;
      actor.speedX *= 1.18;
      actor.speedZ *= 1.14;
      this.emit({ type: 'boss-phase', actorId: actor.id, x: actor.x, z: actor.z, text: 'The chains tear.' });
      this.spawnWretch(actor.x - 75, actor.z - 54);
      this.spawnWretch(actor.x + 70, actor.z + 56);
    }

    const dx = target.x - actor.x;
    const dz = target.z - actor.z;
    const distance = Math.hypot(dx, dz);

    if (actor.aiCooldown <= 0) {
      let attackId = 'boss_sweep';
      if (distance > 185) attackId = 'boss_leap';
      else if (this.bossPhase >= 2 && this.rng.next() < 0.34) attackId = 'boss_shock';
      else if (this.rng.next() < 0.38) attackId = 'boss_leap';
      this.startAttack(actor, attackId, target);
      actor.aiCooldown = this.bossPhase >= 2 ? this.rng.range(0.65, 1.0) : this.rng.range(0.9, 1.35);
      return;
    }

    const move = normalize2(dx, dz);
    const preferred = distance > 105 ? 1 : 0.25;
    this.moveActor(actor, move.x, move.y, preferred, dt);
    actor.state = 'move';
  }

  private updateEnemyAttack(actor: Actor, dt: number): void {
    const runtime = actor.attack;
    if (!runtime) {
      this.enterNeutral(actor);
      return;
    }
    const definition = getAttack(runtime.id);
    runtime.elapsed += dt;
    actor.stateElapsed = runtime.elapsed;

    const target = runtime.targetId === null ? null : this.actors.find((candidate) => candidate.id === runtime.targetId);
    if (target && runtime.elapsed < definition.startup * 0.72) {
      actor.facing = target.x >= actor.x ? 1 : -1;
      actor.z += clamp(target.z - actor.z, -54 * dt, 54 * dt);
    }

    const motionDuration = Math.max(0.01, definition.startup + definition.active);
    if (runtime.elapsed <= motionDuration) {
      actor.x += actor.facing * (definition.movement / motionDuration) * dt;
    }
    this.clampActor(actor);

    if (runtime.elapsed >= attackDuration(definition)) {
      actor.attack = null;
      this.enterNeutral(actor);
    }
  }

  private processAttackHits(): void {
    for (const attacker of this.actors) {
      const runtime = attacker.attack;
      if (!runtime || attacker.state !== 'attack') continue;
      const base = getAttack(runtime.id);
      const definition = attacker.team === 'players' ? withUpgradeEffects(base, this.upgrades) : base;
      if (!isAttackActive(definition, runtime.elapsed)) continue;

      if (!runtime.activeCuePlayed) {
        runtime.activeCuePlayed = true;
        this.emit({ type: 'attack', actorId: attacker.id, x: attacker.x, z: attacker.z, attackId: definition.id });
      }

      let targetsHit = 0;
      for (const target of this.actors) {
        if (target.team === attacker.team || target.state === 'dead' || runtime.hitIds.has(target.id)) continue;
        if (target.invulnerable > 0) continue;
        if (!this.attackIntersects(attacker, target, definition)) continue;

        runtime.hitIds.add(target.id);
        targetsHit += 1;

        if (this.tryParryOrDeflect(attacker, target, definition)) break;
        if (this.tryBlock(attacker, target, definition)) {
          if (targetsHit >= definition.maxTargets) break;
          continue;
        }

        this.applyHit(attacker, target, definition);
        if (targetsHit >= definition.maxTargets) break;
      }
    }
  }

  private attackIntersects(attacker: Actor, target: Actor, definition: AttackDefinition): boolean {
    const dx = target.x - attacker.x;
    const dz = target.z - attacker.z;
    if (definition.arc === 'radial') {
      const radius = Math.max(definition.reach, definition.depth) + target.radius;
      return Math.hypot(dx, dz) <= radius;
    }
    const forward = dx * attacker.facing;
    return (
      forward >= definition.minForward - target.radius &&
      forward <= definition.reach + target.radius &&
      Math.abs(dz) <= definition.depth + target.radius * 0.72
    );
  }

  private tryParryOrDeflect(attacker: Actor, target: Actor, definition: AttackDefinition): boolean {
    if (definition.parryable === false) return false;
    const fromFront = (attacker.x - target.x) * target.facing >= -18;
    if (!fromFront) return false;

    let deflected = target.parryWindow > 0;
    if (!deflected && target.attack) {
      const targetDef = getAttack(target.attack.id);
      if (
        targetDef.deflectStart !== undefined &&
        targetDef.deflectEnd !== undefined &&
        target.attack.elapsed >= targetDef.deflectStart &&
        target.attack.elapsed <= targetDef.deflectEnd
      ) {
        deflected = true;
      }
    }
    if (!deflected) return false;

    attacker.attack = null;
    attacker.state = 'hitstun';
    attacker.stateElapsed = 0;
    attacker.stateDuration = attacker.archetype === 'grotesque' ? 0.24 : 0.52;
    attacker.vx = -attacker.facing * 58;
    attacker.vz = 0;
    target.counterWindow = 1.05;
    target.openingTimer = Math.max(target.openingTimer, target.provokeTimer > 0 ? 2.5 : 1.6);
    target.provokeTimer = 0;
    target.flashTimer = 0.08;
    this.hitStop = Math.max(this.hitStop, 0.075);
    this.emit({ type: 'parry', actorId: target.id, targetId: attacker.id, x: target.x, z: target.z, text: 'TAKE' });
    return true;
  }

  private tryBlock(attacker: Actor, target: Actor, definition: AttackDefinition): boolean {
    if (target.state !== 'block' || target.guard <= 0) return false;
    const fromFront = (attacker.x - target.x) * target.facing >= -14;
    if (!fromFront) return false;

    target.guard -= definition.guardDamage;
    target.guardRegenDelay = 1.55;
    target.flashTimer = 0.06;
    attacker.attack!.blocked = true;
    if (definition.provoke && attacker.team === 'players') attacker.provokeTimer = 2.25;

    target.x += attacker.facing * Math.min(14, definition.knockback * 0.09);
    this.clampActor(target);

    if (target.guard <= 0) {
      target.guard = 0;
      target.state = 'guardbreak';
      target.stateElapsed = 0;
      target.stateDuration = target.archetype === 'grotesque' ? 0.48 : 0.9;
      target.attack = null;
      this.emit({ type: 'guardbreak', actorId: attacker.id, targetId: target.id, x: target.x, z: target.z, text: 'GUARD BROKEN' });
      this.hitStop = Math.max(this.hitStop, 0.085);
    } else {
      this.emit({ type: 'blocked', actorId: attacker.id, targetId: target.id, x: target.x, z: target.z, amount: definition.guardDamage });
      this.hitStop = Math.max(this.hitStop, definition.heavy ? 0.045 : 0.025);
    }
    return true;
  }

  private applyHit(attacker: Actor, target: Actor, definition: AttackDefinition): void {
    let multiplier = 1;
    let thirdIntention = false;

    if (attacker.team === 'players' && definition.heavy && attacker.openingTimer > 0) {
      multiplier = 1.52;
      if (attacker.weapon === 'longsword' && this.upgrades.has('longsword-control')) multiplier = 1.78;
      attacker.openingTimer = 0;
      attacker.provokeTimer = 0;
      thirdIntention = true;
    }

    let damage = definition.damage * multiplier;
    let appliedHitstun = definition.hitstun;

    if (target.armor > 0) {
      const armorPressure = definition.guardDamage * (definition.heavy ? 1.05 : 0.42) * (thirdIntention ? 1.65 : 1);
      target.armor = Math.max(0, target.armor - armorPressure);
      damage *= definition.heavy || thirdIntention ? 0.66 : 0.28;
      if (target.armor > 0 && !definition.heavy) appliedHitstun = Math.min(appliedHitstun, 0.12);
    }

    if (target.archetype === 'grotesque') {
      appliedHitstun = definition.heavy ? Math.min(appliedHitstun, 0.2) : 0.055;
    }

    const roundedDamage = Math.max(1, Math.round(damage));
    target.health = Math.max(0, target.health - roundedDamage);
    target.guardRegenDelay = 1.25;
    target.flashTimer = 0.1;
    target.attack = null;
    target.vx = attacker.facing * definition.knockback;
    target.vz += Math.sign(target.z - attacker.z || 1) * definition.knockback * 0.18;

    attacker.attack!.hitConfirmed = true;
    attacker.comboCount += 1;

    if (target.health <= 0) {
      target.state = 'dead';
      target.stateElapsed = 0;
      target.stateDuration = 1.15;
      target.deathTimer = 0;
      target.vx = attacker.facing * definition.knockback * 1.2;
      this.score += target.scoreValue;
      this.emit({ type: 'death', actorId: attacker.id, targetId: target.id, x: target.x, z: target.z, amount: roundedDamage });
    } else {
      target.state = 'hitstun';
      target.stateElapsed = 0;
      target.stateDuration = appliedHitstun;
    }

    if (definition.signature) {
      this.emit({ type: 'signature', actorId: attacker.id, targetId: target.id, x: attacker.x, z: attacker.z, text: thirdIntention ? 'PROVOKE · TAKE · HIT' : definition.signature });
    }
    const hitEvent: GameEvent = {
      type: definition.heavy ? 'heavy-hit' : 'hit',
      actorId: attacker.id,
      targetId: target.id,
      x: target.x,
      z: target.z,
      amount: roundedDamage,
      attackId: definition.id
    };
    if (thirdIntention) hitEvent.text = 'HIT';
    this.emit(hitEvent);
    this.hitStop = Math.max(this.hitStop, definition.hitStop * (thirdIntention ? 1.3 : 1));
  }

  private startAttack(actor: Actor, attackId: string, explicitTarget?: Actor): void {
    const definition = actor.team === 'players'
      ? withUpgradeEffects(getAttack(attackId), this.upgrades)
      : getAttack(attackId);
    const target = explicitTarget ?? chooseSoftTarget(actor, this.actors, {
      maxForward: definition.reach + 74,
      maxDepth: Math.max(96, definition.depth + 68),
      previousTargetId: actor.attack?.targetId ?? null
    });

    if (target) actor.facing = target.x >= actor.x ? 1 : -1;
    actor.attack = {
      id: attackId,
      elapsed: 0,
      targetId: target?.id ?? null,
      hitIds: new Set<number>(),
      hitConfirmed: false,
      blocked: false,
      queuedAction: null,
      activeCuePlayed: false
    };
    actor.state = 'attack';
    actor.stateElapsed = 0;
    actor.stateDuration = attackDuration(definition);
    actor.vx = 0;
    actor.vz = 0;
  }

  private startDodge(actor: Actor, moveX: number, moveZ: number): void {
    actor.state = 'dodge';
    actor.stateElapsed = 0;
    actor.stateDuration = 0.31;
    actor.stateMoveX = moveX;
    actor.stateMoveZ = moveZ;
    actor.invulnerable = 0.18;
    if (Math.abs(moveX) > 0.15) actor.facing = moveX >= 0 ? 1 : -1;
  }

  private startJump(actor: Actor): void {
    actor.state = 'jump';
    actor.stateElapsed = 0;
    actor.stateDuration = 0.62;
    actor.vx = 0;
    actor.vz = 0;
  }

  private startSwitch(actor: Actor, fromHit: boolean): void {
    actor.desiredWeapon = actor.weapon === 'longsword' ? 'dussack' : 'longsword';
    actor.state = 'switch';
    actor.stateElapsed = 0;
    actor.stateDuration = this.upgrades.has('quick-change') && fromHit ? 0.11 : fromHit ? 0.19 : 0.31;
    actor.stateMoveX = fromHit ? 1 : 0;
    actor.stateMoveZ = 0;
    actor.attack = null;
    actor.comboCount = fromHit ? actor.comboCount : 0;
  }

  private enterNeutral(actor: Actor): void {
    actor.state = 'idle';
    actor.stateElapsed = 0;
    actor.stateDuration = 0;
    actor.vx = 0;
    actor.vz = 0;
    actor.attack = null;
  }

  private moveActor(actor: Actor, moveX: number, moveZ: number, scale: number, dt: number): void {
    const normalized = normalize2(moveX, moveZ);
    const targetVx = normalized.x * actor.speedX * scale;
    const targetVz = normalized.y * actor.speedZ * scale;
    actor.vx = damp(actor.vx, targetVx, 16, dt);
    actor.vz = damp(actor.vz, targetVz, 16, dt);
    actor.x += actor.vx * dt;
    actor.z += actor.vz * dt;
    if (Math.abs(normalized.x) > 0.12) actor.facing = normalized.x >= 0 ? 1 : -1;
    this.clampActor(actor);
  }

  private clampActor(actor: Actor): void {
    actor.x = clamp(actor.x, ARENA.minX + actor.radius, ARENA.maxX - actor.radius);
    actor.z = clamp(actor.z, ARENA.minZ + actor.radius * 0.35, ARENA.maxZ - actor.radius * 0.25);
  }

  private resolveSeparation(): void {
    const living = this.actors.filter((actor) => actor.state !== 'dead');
    for (let firstIndex = 0; firstIndex < living.length; firstIndex += 1) {
      const first = living[firstIndex];
      if (!first) continue;
      for (let secondIndex = firstIndex + 1; secondIndex < living.length; secondIndex += 1) {
        const second = living[secondIndex];
        if (!second) continue;
        const dx = second.x - first.x;
        const dz = second.z - first.z;
        const distance = Math.hypot(dx, dz);
        const minimum = (first.radius + second.radius) * 0.72;
        if (distance <= 0.001 || distance >= minimum) continue;
        const push = (minimum - distance) * 0.5;
        const nx = dx / distance;
        const nz = dz / distance;
        if (first.state !== 'attack' && first.state !== 'dodge') {
          first.x -= nx * push;
          first.z -= nz * push;
          this.clampActor(first);
        }
        if (second.state !== 'attack' && second.state !== 'dodge') {
          second.x += nx * push;
          second.z += nz * push;
          this.clampActor(second);
        }
      }
    }
  }

  private updatePermissions(dt: number): void {
    this.permissionTimer -= dt;
    if (this.permissionTimer > 0) return;
    this.permissionTimer = 0.38;

    for (const enemy of this.enemyActors()) enemy.attackPermission = enemy.archetype === 'grotesque';

    for (const player of this.playerActors().filter((actor) => actor.state !== 'dead')) {
      const candidates = this.enemyActors()
        .filter((enemy) => enemy.state !== 'dead' && enemy.archetype !== 'grotesque')
        .sort((left, right) => this.distanceSquared(left, player) - this.distanceSquared(right, player));
      let meleeSlots = 2;
      let reachSlots = 1;
      for (const enemy of candidates) {
        if (enemy.attackPermission) continue;
        if (enemy.archetype === 'spear') {
          if (reachSlots <= 0) continue;
          reachSlots -= 1;
          enemy.attackPermission = true;
        } else {
          if (meleeSlots <= 0) continue;
          meleeSlots -= 1;
          enemy.attackPermission = true;
        }
        if (meleeSlots <= 0 && reachSlots <= 0) break;
      }
    }
  }

  private updateSpawns(dt: number): void {
    this.spawnClock += dt;
    while (this.spawnQueue.length > 0 && (this.spawnQueue[0]?.at ?? Number.POSITIVE_INFINITY) <= this.spawnClock) {
      const entry = this.spawnQueue.shift();
      if (entry) this.spawnEnemy(entry.archetype);
    }
  }

  private beginWave(index: number): void {
    const definition = WAVES[index];
    if (!definition) {
      this.phase = 'victory';
      this.waveTitle = 'The road goes quiet—for now.';
      this.emit({ type: 'victory', text: this.waveTitle });
      return;
    }

    this.phase = 'wave';
    this.waveIndex = index;
    this.waveTitle = definition.title;
    this.spawnClock = 0;
    this.spawnQueue = [];
    this.clearTimer = 0;
    this.waveResolved = false;
    this.offeredUpgrades = [];
    if (definition.boss) this.bossPhase = 1;

    let at = 0.45;
    for (const group of definition.groups) {
      let count = group.count;
      if (this.playerCount === 2 && group.archetype !== 'grotesque') {
        count += group.archetype === 'thug' ? 2 : 1;
      }
      for (let iteration = 0; iteration < count; iteration += 1) {
        this.spawnQueue.push({ at, archetype: group.archetype });
        at += group.interval;
      }
      at += 0.3;
    }

    this.emit({ type: 'banner', text: definition.title });
  }

  private spawnEnemy(archetype: Exclude<Archetype, 'meyer'>): void {
    if (archetype === 'grotesque') {
      const boss = createEnemy(this.nextActorId++, archetype, 940, 432);
      this.actors.push(boss);
      return;
    }
    const fromRight = this.nextActorId % 2 === 0;
    const x = fromRight ? ARENA.maxX - 34 : ARENA.minX + 34;
    const z = this.rng.range(ARENA.minZ + 32, ARENA.maxZ - 28);
    const enemy = createEnemy(this.nextActorId++, archetype, x, z);
    enemy.facing = fromRight ? -1 : 1;
    this.actors.push(enemy);
  }

  private spawnWretch(x: number, z: number): void {
    const enemy = createEnemy(this.nextActorId++, 'wretch', x, z);
    enemy.facing = x > 640 ? -1 : 1;
    this.actors.push(enemy);
  }

  private checkWaveResolution(dt: number): void {
    if (this.waveResolved || this.spawnQueue.length > 0) return;
    const enemiesAlive = this.enemyActors().some((actor) => actor.state !== 'dead');
    if (enemiesAlive) {
      this.clearTimer = 0;
      return;
    }

    this.clearTimer += dt;
    if (this.clearTimer < 1.05) return;
    this.waveResolved = true;
    this.emit({ type: 'wave-clear', text: this.waveTitle });

    const definition = WAVES[this.waveIndex];
    if (definition?.boss) {
      this.phase = 'victory';
      this.waveTitle = 'The castellan yields. A master’s name is spoken: ACHILLE MAROZZO.';
      this.emit({ type: 'victory', text: this.waveTitle });
      return;
    }

    if (definition?.upgradeAfter) {
      this.phase = 'upgrade';
      const offer = UPGRADE_OFFERS[Math.min(this.upgradeOfferIndex, UPGRADE_OFFERS.length - 1)];
      this.offeredUpgrades = offer ? [...offer].filter((id) => !this.upgrades.has(id)) : [];
      this.upgradeOfferIndex += 1;
      this.emit({ type: 'upgrade-offer', upgrades: [...this.offeredUpgrades] });
      return;
    }

    this.beginWave(this.waveIndex + 1);
  }

  private checkDefeat(): void {
    if (this.playerActors().some((actor) => actor.state !== 'dead')) return;
    this.phase = 'defeat';
    this.waveTitle = 'The road takes another name.';
    this.emit({ type: 'defeat', text: this.waveTitle });
  }

  private cleanupActors(): void {
    for (let index = this.actors.length - 1; index >= 0; index -= 1) {
      const actor = this.actors[index];
      if (!actor || actor.team === 'players') continue;
      if (actor.state === 'dead' && actor.deathTimer >= 1.15) this.actors.splice(index, 1);
    }
  }

  private nearestLivingPlayer(actor: Actor): Actor | null {
    let best: Actor | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const player of this.playerActors()) {
      if (player.state === 'dead') continue;
      const distance = this.distanceSquared(actor, player);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = player;
      }
    }
    return best;
  }

  private playerActors(): Actor[] {
    return this.actors.filter((actor) => actor.team === 'players');
  }

  private enemyActors(): Actor[] {
    return this.actors.filter((actor) => actor.team === 'enemies');
  }

  private distanceSquared(left: Actor, right: Actor): number {
    const dx = right.x - left.x;
    const dz = right.z - left.z;
    return dx * dx + dz * dz;
  }

  private emit(event: GameEvent): void {
    this.events.push(event);
  }
}
