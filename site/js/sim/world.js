import { attackDuration, getAttack, isHitZoneExposed, isAttackActive, resolveCrouchAttack, resolveDodgeAttack, resolvePlayerAttack, resolveSwitchAttack, withUpgradeEffects } from './attacks.js';
import { createEnemy, createPlayer } from './factories.js';
import { clamp, damp, normalize2 } from './math.js';
import { Rng } from './rng.js';
import { chooseSoftTarget } from './targeting.js';
import { UPGRADE_OFFERS } from './upgrades.js';
import { WAVES } from './waves.js';
import { GAME_SNAPSHOT_VERSION, NEUTRAL_INPUT } from './types.js';
export const ARENA = Object.freeze({
    minX: 92,
    maxX: 1188,
    minZ: 248,
    maxZ: 612
});
export const CROUCH_DURATION_SECONDS = 0.48;
export const CROUCH_ATTACK_WINDOW_SECONDS = 0.36;
const MOVE_INPUT_DEADZONE = 0.1;
const DODGE_INPUT_DEADZONE = 0.15;
export class GameWorld {
    actors = [];
    upgrades = new Set();
    phase = 'title';
    waveIndex = -1;
    waveTitle = '';
    score = 0;
    bossPhase = 0;
    tick = 0;
    time = 0;
    offeredUpgrades = [];
    rng;
    playerCount;
    events = [];
    nextActorId = 1;
    countdownTimer = 0;
    spawnClock = 0;
    spawnQueue = [];
    permissionTimer = 0;
    clearTimer = 0;
    hitStop = 0;
    pendingPlayerEdges = [];
    waveResolved = false;
    upgradeOfferIndex = 0;
    constructor(options) {
        this.playerCount = options.playerCount;
        this.rng = new Rng(options.seed);
        const centreX = 400;
        for (let index = 0; index < options.playerCount; index += 1) {
            this.actors.push(createPlayer(this.nextActorId++, index, centreX - index * 64, 420 + index * 54));
            this.pendingPlayerEdges.push({ ...NEUTRAL_INPUT });
        }
        this.phase = 'countdown';
        this.waveTitle = 'Meyer Crosses the Alps';
        this.countdownTimer = options.skipCountdown ? 0.05 : 1.25;
        this.emit({ type: 'banner', text: 'Meyer Crosses the Alps' });
    }
    step(dt, inputs) {
        const safeDt = clamp(dt, 0, 1 / 20);
        this.tick += 1;
        if (this.phase === 'countdown') {
            this.countdownTimer -= safeDt;
            if (this.countdownTimer <= 0)
                this.beginWave(0);
            return;
        }
        if (this.phase !== 'wave')
            return;
        if (this.hitStop > 0) {
            this.bufferPlayerEdges(inputs);
            this.hitStop -= safeDt;
            return;
        }
        this.time += safeDt;
        this.updateSpawns(safeDt);
        this.updatePermissions(safeDt);
        this.updateActorTimers(safeDt);
        const players = this.playerActors();
        for (const player of players) {
            const playerIndex = player.playerIndex ?? 0;
            const input = this.consumePlayerInput(playerIndex, inputs[playerIndex] ?? NEUTRAL_INPUT);
            this.updatePlayer(player, input, safeDt);
        }
        for (const actor of this.actors) {
            if (actor.team === 'enemies')
                this.updateEnemy(actor, safeDt);
        }
        this.processAttackHits();
        this.resolveSeparation();
        this.cleanupActors();
        this.checkWaveResolution(safeDt);
        this.checkDefeat();
    }
    chooseUpgrade(id) {
        if (this.phase !== 'upgrade' || !this.offeredUpgrades.includes(id))
            return false;
        this.upgrades.add(id);
        this.offeredUpgrades = [];
        this.emit({ type: 'upgrade-chosen', text: id });
        this.beginWave(this.waveIndex + 1);
        return true;
    }
    restart() {
        return new GameWorld({ playerCount: this.playerCount, seed: this.rng.integer(1, 0x7fffffff) });
    }
    consumeEvents() {
        return this.events.splice(0, this.events.length);
    }
    snapshot() {
        return {
            version: GAME_SNAPSHOT_VERSION,
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
    actorSnapshot(actor) {
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
            stateMoveX: actor.stateMoveX,
            stateMoveZ: actor.stateMoveZ,
            weapon: actor.weapon,
            desiredWeapon: actor.desiredWeapon,
            attackId: actor.attack?.id ?? null,
            attackElapsed: actor.attack?.elapsed ?? 0,
            reactionZone: actor.reactionZone,
            invulnerable: actor.invulnerable,
            openingTimer: actor.openingTimer,
            provokeTimer: actor.provokeTimer,
            counterWindow: actor.counterWindow,
            flashTimer: actor.flashTimer,
            comboCount: actor.comboCount,
            deathTimer: actor.deathTimer
        };
    }
    updateActorTimers(dt) {
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
            if (actor.guardRegenDelay <= 0 &&
                actor.state !== 'block' &&
                actor.state !== 'guardbreak' &&
                actor.guard < actor.maxGuard) {
                const rate = actor.team === 'players' ? 18 : 11;
                actor.guard = Math.min(actor.maxGuard, actor.guard + rate * dt);
            }
            if (actor.state === 'dead') {
                actor.deathTimer += dt;
                actor.stateElapsed = actor.deathTimer;
            }
        }
    }
    updatePlayer(actor, input, dt) {
        actor.lastInput = { ...input };
        if (actor.state === 'dead')
            return;
        if (input.guardPressed)
            actor.parryWindow = 0.17;
        if (actor.state === 'hitstun' || actor.state === 'guardbreak') {
            actor.stateElapsed += dt;
            actor.x += actor.vx * dt;
            actor.z += actor.vz * dt;
            actor.vx = damp(actor.vx, 0, 11, dt);
            actor.vz = damp(actor.vz, 0, 11, dt);
            this.clampActor(actor);
            if (actor.stateElapsed >= actor.stateDuration) {
                if (actor.state === 'guardbreak')
                    actor.guard = actor.maxGuard * 0.34;
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
                if (shouldEnter)
                    this.startAttack(actor, resolveSwitchAttack(actor.weapon));
                else
                    this.enterNeutral(actor);
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
                if (actor.weapon === 'dussack' && this.upgrades.has('dussack-passing-step'))
                    actor.invulnerable = 0.24;
                return;
            }
            if (actor.stateElapsed >= actor.stateDuration)
                this.enterNeutral(actor);
            return;
        }
        if (actor.state === 'crouch') {
            actor.stateElapsed += dt;
            actor.vx = 0;
            actor.vz = 0;
            if ((input.lightPressed || input.heavyPressed) &&
                actor.stateElapsed <= CROUCH_ATTACK_WINDOW_SECONDS) {
                const action = input.lightPressed ? 'light' : 'heavy';
                this.startAttack(actor, resolveCrouchAttack(actor.weapon, action));
                return;
            }
            if (actor.stateElapsed >= actor.stateDuration)
                this.enterNeutral(actor);
            return;
        }
        if (actor.state === 'block') {
            actor.stateElapsed += dt;
            if (!input.guardHeld || actor.guard <= 0) {
                this.enterNeutral(actor);
            }
            else {
                this.moveActor(actor, input.moveX, input.moveZ, 0.31, dt);
            }
            return;
        }
        if (input.switchPressed) {
            this.startSwitch(actor, false);
            return;
        }
        if (input.mobilityPressed) {
            const rawMagnitude = Math.hypot(input.moveX, input.moveZ);
            const direction = rawMagnitude > DODGE_INPUT_DEADZONE
                ? normalize2(input.moveX, input.moveZ)
                : { x: 0, y: 0 };
            if (rawMagnitude > DODGE_INPUT_DEADZONE)
                this.startDodge(actor, direction.x, direction.y);
            else if (input.lightPressed || input.heavyPressed) {
                const action = input.lightPressed ? 'light' : 'heavy';
                this.startAttack(actor, resolveCrouchAttack(actor.weapon, action));
            }
            else {
                this.startCrouch(actor);
            }
            return;
        }
        if (input.guardHeld) {
            actor.state = 'block';
            actor.stateElapsed = 0;
            // Zero means an input-held state with no predetermined end. Keeping this
            // finite also preserves the snapshot over JSON for the replica client.
            actor.stateDuration = 0;
            actor.vx = 0;
            actor.vz = 0;
            actor.reactionZone = null;
            return;
        }
        if (input.lightPressed || input.heavyPressed) {
            const action = input.lightPressed ? 'light' : 'heavy';
            const id = resolvePlayerAttack(actor.weapon, action, null, actor.counterWindow > 0);
            if (action === 'heavy' && actor.counterWindow > 0)
                actor.counterWindow = 0;
            this.startAttack(actor, id);
            return;
        }
        this.moveActor(actor, input.moveX, input.moveZ, 1, dt);
        this.updateContinuousState(actor, Math.hypot(input.moveX, input.moveZ) > MOVE_INPUT_DEADZONE ? 'move' : 'idle', dt);
    }
    updatePlayerAttack(actor, input, dt) {
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
                if (Math.abs(target.x - actor.x) > 6)
                    actor.facing = target.x >= actor.x ? 1 : -1;
            }
        }
        const motionDuration = Math.max(0.01, definition.startup + definition.active);
        if (runtime.elapsed <= motionDuration) {
            actor.x += actor.facing * (definition.movement / motionDuration) * dt;
        }
        this.clampActor(actor);
        const queueOpen = runtime.elapsed >= definition.startup * 0.45;
        if (queueOpen) {
            if (input.lightPressed)
                runtime.queuedAction = 'light';
            else if (input.heavyPressed)
                runtime.queuedAction = 'heavy';
            else if (input.switchPressed && runtime.hitConfirmed)
                runtime.queuedAction = 'switch';
        }
        if (runtime.blocked &&
            definition.provoke &&
            this.upgrades.has('second-intention') &&
            input.guardHeld &&
            runtime.elapsed >= definition.startup + definition.active) {
            actor.attack = null;
            actor.state = 'block';
            actor.stateElapsed = 0;
            actor.stateDuration = 0;
            actor.reactionZone = null;
            return;
        }
        if (runtime.elapsed < attackDuration(definition))
            return;
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
            if (queued === 'heavy' && actor.counterWindow > 0)
                actor.counterWindow = 0;
            this.startAttack(actor, next);
            return;
        }
        actor.comboCount = 0;
        this.enterNeutral(actor);
    }
    updateEnemy(actor, dt) {
        if (actor.state === 'dead')
            return;
        if (actor.state === 'hitstun' || actor.state === 'guardbreak') {
            actor.stateElapsed += dt;
            actor.x += actor.vx * dt;
            actor.z += actor.vz * dt;
            actor.vx = damp(actor.vx, 0, 10, dt);
            actor.vz = damp(actor.vz, 0, 10, dt);
            this.clampActor(actor);
            if (actor.stateElapsed >= actor.stateDuration) {
                if (actor.state === 'guardbreak')
                    actor.guard = actor.maxGuard * 0.3;
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
            if (actor.stateElapsed >= actor.stateDuration)
                this.enterNeutral(actor);
            return;
        }
        const target = this.nearestLivingPlayer(actor);
        if (!target)
            return;
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
                actor.reactionZone = null;
                actor.parryWindow = this.rng.next() < 0.25 ? 0.13 : 0;
                return;
            }
        }
        if (actor.attackPermission && actor.aiCooldown <= 0) {
            if (actor.archetype === 'thug' && forward < 67 && depth < 35) {
                const roll = this.rng.next();
                const attackId = target.state === 'crouch'
                    ? (roll < 0.58 ? 'thug_low' : 'thug_body')
                    : (roll < 0.4 ? 'thug_overhead' : roll < 0.72 ? 'thug_body' : 'thug_low');
                this.startAttack(actor, attackId, target);
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
        }
        else if (actor.archetype === 'spear') {
            desiredX = target.x - actor.facing * 126;
            desiredZ = target.z;
        }
        else {
            desiredX = target.x - actor.facing * 52;
        }
        const move = normalize2(desiredX - actor.x, desiredZ - actor.z);
        const speedScale = actor.attackPermission ? 1 : 0.72;
        this.moveActor(actor, move.x, move.y, speedScale, dt);
        this.updateContinuousState(actor, 'move', dt);
    }
    updateBossAI(actor, target, dt) {
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
            if (distance > 185)
                attackId = 'boss_leap';
            else if (this.bossPhase >= 2 && this.rng.next() < 0.34)
                attackId = 'boss_shock';
            else if (this.rng.next() < 0.38)
                attackId = 'boss_leap';
            this.startAttack(actor, attackId, target);
            actor.aiCooldown = this.bossPhase >= 2 ? this.rng.range(0.65, 1.0) : this.rng.range(0.9, 1.35);
            return;
        }
        const move = normalize2(dx, dz);
        const preferred = distance > 105 ? 1 : 0.25;
        this.moveActor(actor, move.x, move.y, preferred, dt);
        this.updateContinuousState(actor, 'move', dt);
    }
    updateEnemyAttack(actor, dt) {
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
    processAttackHits() {
        for (const attacker of this.actors) {
            const runtime = attacker.attack;
            if (!runtime || attacker.state !== 'attack')
                continue;
            const base = getAttack(runtime.id);
            const definition = attacker.team === 'players' ? withUpgradeEffects(base, this.upgrades) : base;
            if (!isAttackActive(definition, runtime.elapsed))
                continue;
            if (!runtime.activeCuePlayed) {
                runtime.activeCuePlayed = true;
                this.emit({
                    type: 'attack',
                    actorId: attacker.id,
                    x: attacker.x,
                    z: attacker.z,
                    attackId: definition.id,
                    hitZone: definition.hitZone
                });
            }
            let targetsHit = 0;
            for (const target of this.actors) {
                if (target.team === attacker.team || target.state === 'dead' || runtime.hitIds.has(target.id))
                    continue;
                if (target.invulnerable > 0)
                    continue;
                if (!this.attackIntersects(attacker, target, definition))
                    continue;
                runtime.hitIds.add(target.id);
                targetsHit += 1;
                if (this.tryParryOrDeflect(attacker, target, definition))
                    break;
                if (this.tryBlock(attacker, target, definition)) {
                    if (targetsHit >= definition.maxTargets)
                        break;
                    continue;
                }
                this.applyHit(attacker, target, definition);
                if (targetsHit >= definition.maxTargets)
                    break;
            }
        }
    }
    attackIntersects(attacker, target, definition) {
        const dx = target.x - attacker.x;
        const dz = target.z - attacker.z;
        let intersects;
        if (definition.arc === 'radial') {
            const radius = Math.max(definition.reach, definition.depth) + target.radius;
            intersects = Math.hypot(dx, dz) <= radius;
        }
        else {
            const forward = dx * attacker.facing;
            intersects = (forward >= definition.minForward - target.radius &&
                forward <= definition.reach + target.radius &&
                Math.abs(dz) <= definition.depth + target.radius * 0.72);
        }
        const targetPosture = this.hasCrouchedPosture(target) ? 'crouch' : target.state;
        return intersects && isHitZoneExposed(targetPosture, definition.hitZone);
    }
    tryParryOrDeflect(attacker, target, definition) {
        if (definition.parryable === false)
            return false;
        const fromFront = (attacker.x - target.x) * target.facing >= -18;
        if (!fromFront)
            return false;
        const timedParry = target.parryWindow > 0;
        let deflected = timedParry;
        if (!deflected && target.attack) {
            const targetDef = getAttack(target.attack.id);
            if (targetDef.deflectStart !== undefined &&
                targetDef.deflectEnd !== undefined &&
                target.attack.elapsed >= targetDef.deflectStart &&
                target.attack.elapsed <= targetDef.deflectEnd) {
                deflected = true;
            }
        }
        if (!deflected)
            return false;
        attacker.attack = null;
        attacker.state = 'hitstun';
        attacker.stateElapsed = 0;
        attacker.stateDuration = attacker.archetype === 'grotesque' ? 0.24 : 0.52;
        attacker.reactionZone = definition.hitZone;
        attacker.vx = -attacker.facing * 58;
        attacker.vz = 0;
        target.counterWindow = 1.05;
        target.openingTimer = Math.max(target.openingTimer, target.provokeTimer > 0 ? 2.5 : 1.6);
        target.provokeTimer = 0;
        target.flashTimer = 0.08;
        this.hitStop = Math.max(this.hitStop, 0.075);
        this.emit({
            type: timedParry ? 'parry' : 'interception',
            actorId: target.id,
            targetId: attacker.id,
            x: target.x,
            z: target.z,
            text: 'TAKE',
            hitZone: definition.hitZone
        });
        return true;
    }
    tryBlock(attacker, target, definition) {
        if (target.state !== 'block' || target.guard <= 0)
            return false;
        const fromFront = (attacker.x - target.x) * target.facing >= -14;
        if (!fromFront)
            return false;
        const targetCrouched = this.hasCrouchedPosture(target);
        target.guard -= definition.guardDamage;
        target.guardRegenDelay = 1.55;
        target.flashTimer = 0.06;
        attacker.attack.blocked = true;
        if (definition.provoke && attacker.team === 'players')
            attacker.provokeTimer = 2.25;
        target.x += attacker.facing * Math.min(14, definition.knockback * 0.09);
        this.clampActor(target);
        if (target.guard <= 0) {
            target.guard = 0;
            target.reactionZone = definition.hitZone;
            target.state = 'guardbreak';
            target.stateElapsed = 0;
            target.stateDuration = target.archetype === 'grotesque' ? 0.48 : 0.9;
            target.attack = null;
            this.emit({
                type: 'guardbreak',
                actorId: attacker.id,
                targetId: target.id,
                x: target.x,
                z: target.z,
                text: 'GUARD BROKEN',
                hitZone: definition.hitZone,
                targetCrouched
            });
            this.hitStop = Math.max(this.hitStop, 0.085);
        }
        else {
            this.emit({
                type: 'blocked',
                actorId: attacker.id,
                targetId: target.id,
                x: target.x,
                z: target.z,
                amount: definition.guardDamage,
                hitZone: definition.hitZone,
                targetCrouched
            });
            this.hitStop = Math.max(this.hitStop, definition.heavy ? 0.045 : 0.025);
        }
        return true;
    }
    applyHit(attacker, target, definition) {
        let multiplier = 1;
        let thirdIntention = false;
        if (attacker.team === 'players' && definition.heavy && attacker.openingTimer > 0) {
            multiplier = 1.52;
            if (attacker.weapon === 'longsword' && this.upgrades.has('longsword-control'))
                multiplier = 1.78;
            attacker.openingTimer = 0;
            attacker.provokeTimer = 0;
            thirdIntention = true;
        }
        let damage = definition.damage * multiplier;
        let appliedHitstun = definition.hitstun;
        const absorbedByArmor = target.armor > 0;
        if (absorbedByArmor) {
            const armorPressure = definition.guardDamage * (definition.heavy ? 1.05 : 0.42) * (thirdIntention ? 1.65 : 1);
            target.armor = Math.max(0, target.armor - armorPressure);
            damage *= definition.heavy || thirdIntention ? 0.66 : 0.28;
            if (target.armor > 0 && !definition.heavy)
                appliedHitstun = Math.min(appliedHitstun, 0.12);
        }
        if (target.archetype === 'grotesque') {
            appliedHitstun = definition.heavy ? Math.min(appliedHitstun, 0.2) : 0.055;
        }
        const roundedDamage = Math.max(1, Math.round(damage));
        const targetCrouched = this.hasCrouchedPosture(target);
        target.health = Math.max(0, target.health - roundedDamage);
        target.guardRegenDelay = 1.25;
        target.flashTimer = 0.1;
        target.reactionZone = definition.hitZone;
        target.attack = null;
        target.vx = attacker.facing * definition.knockback;
        target.vz += Math.sign(target.z - attacker.z || 1) * definition.knockback * 0.18;
        attacker.attack.hitConfirmed = true;
        attacker.comboCount += 1;
        if (target.health <= 0) {
            target.state = 'dead';
            target.stateElapsed = 0;
            target.stateDuration = 1.15;
            target.deathTimer = 0;
            target.vx = attacker.facing * definition.knockback * 1.2;
            this.score += target.scoreValue;
            this.emit({
                type: 'death',
                actorId: attacker.id,
                targetId: target.id,
                x: target.x,
                z: target.z,
                amount: roundedDamage,
                hitZone: definition.hitZone,
                targetCrouched
            });
        }
        else {
            target.state = 'hitstun';
            target.stateElapsed = 0;
            target.stateDuration = appliedHitstun;
        }
        if (definition.signature && !attacker.attack.signatureShown) {
            this.emit({ type: 'signature', actorId: attacker.id, targetId: target.id, x: attacker.x, z: attacker.z, text: thirdIntention ? 'PROVOKE · TAKE · HIT' : definition.signature });
            attacker.attack.signatureShown = true;
        }
        const hitEvent = {
            type: definition.heavy ? 'heavy-hit' : 'hit',
            actorId: attacker.id,
            targetId: target.id,
            x: target.x,
            z: target.z,
            amount: roundedDamage,
            attackId: definition.id,
            hitZone: definition.hitZone,
            targetCrouched,
            impact: absorbedByArmor ? 'armor' : 'flesh'
        };
        if (thirdIntention)
            hitEvent.text = 'HIT';
        this.emit(hitEvent);
        this.hitStop = Math.max(this.hitStop, definition.hitStop * (thirdIntention ? 1.3 : 1));
    }
    startAttack(actor, attackId, explicitTarget) {
        const definition = actor.team === 'players'
            ? withUpgradeEffects(getAttack(attackId), this.upgrades)
            : getAttack(attackId);
        const target = explicitTarget ?? chooseSoftTarget(actor, this.actors, {
            maxForward: definition.reach + 74,
            maxDepth: Math.max(96, definition.depth + 68),
            previousTargetId: actor.attack?.targetId ?? null
        });
        if (target)
            actor.facing = target.x >= actor.x ? 1 : -1;
        actor.attack = {
            id: attackId,
            elapsed: 0,
            targetId: target?.id ?? null,
            hitIds: new Set(),
            hitConfirmed: false,
            blocked: false,
            queuedAction: null,
            activeCuePlayed: false,
            signatureShown: false
        };
        actor.state = 'attack';
        actor.stateElapsed = 0;
        actor.stateDuration = attackDuration(definition);
        actor.vx = 0;
        actor.vz = 0;
        actor.reactionZone = null;
    }
    startDodge(actor, moveX, moveZ) {
        actor.state = 'dodge';
        actor.stateElapsed = 0;
        actor.stateDuration = 0.31;
        actor.stateMoveX = moveX;
        actor.stateMoveZ = moveZ;
        actor.invulnerable = 0.18;
        actor.reactionZone = null;
        if (Math.abs(moveX) > 0.15)
            actor.facing = moveX >= 0 ? 1 : -1;
    }
    startCrouch(actor) {
        actor.state = 'crouch';
        actor.stateElapsed = 0;
        actor.stateDuration = CROUCH_DURATION_SECONDS;
        actor.vx = 0;
        actor.vz = 0;
        actor.reactionZone = null;
    }
    startSwitch(actor, fromHit) {
        actor.desiredWeapon = actor.weapon === 'longsword' ? 'dussack' : 'longsword';
        actor.state = 'switch';
        actor.stateElapsed = 0;
        actor.stateDuration = this.upgrades.has('quick-change') && fromHit ? 0.11 : fromHit ? 0.19 : 0.31;
        actor.stateMoveX = fromHit ? 1 : 0;
        actor.stateMoveZ = 0;
        actor.attack = null;
        actor.comboCount = fromHit ? actor.comboCount : 0;
        actor.reactionZone = null;
    }
    enterNeutral(actor) {
        actor.state = 'idle';
        actor.stateElapsed = 0;
        actor.stateDuration = 0;
        actor.vx = 0;
        actor.vz = 0;
        actor.attack = null;
        actor.reactionZone = null;
    }
    updateContinuousState(actor, state, dt) {
        if (actor.state === state)
            actor.stateElapsed += dt;
        else
            actor.stateElapsed = 0;
        actor.state = state;
        actor.stateDuration = 0;
        actor.reactionZone = null;
    }
    moveActor(actor, moveX, moveZ, scale, dt) {
        const normalized = Math.hypot(moveX, moveZ) > MOVE_INPUT_DEADZONE
            ? normalize2(moveX, moveZ)
            : { x: 0, y: 0 };
        const targetVx = normalized.x * actor.speedX * scale;
        const targetVz = normalized.y * actor.speedZ * scale;
        actor.vx = damp(actor.vx, targetVx, 16, dt);
        actor.vz = damp(actor.vz, targetVz, 16, dt);
        actor.x += actor.vx * dt;
        actor.z += actor.vz * dt;
        if (Math.abs(normalized.x) > 0.12)
            actor.facing = normalized.x >= 0 ? 1 : -1;
        this.clampActor(actor);
    }
    hasCrouchedPosture(actor) {
        if (actor.state === 'crouch')
            return true;
        if (actor.state !== 'attack' || !actor.attack)
            return false;
        return getAttack(actor.attack.id).crouchedPosture === true;
    }
    bufferPlayerEdges(inputs) {
        for (let index = 0; index < this.playerCount; index += 1) {
            const pending = this.pendingPlayerEdges[index];
            if (pending)
                this.mergePlayerEdges(pending, inputs[index] ?? NEUTRAL_INPUT);
        }
    }
    consumePlayerInput(playerIndex, current) {
        const pending = this.pendingPlayerEdges[playerIndex];
        if (!pending)
            return { ...current };
        this.mergePlayerEdges(pending, current);
        const actor = this.actors.find((candidate) => candidate.playerIndex === playerIndex);
        if (actor && (actor.state === 'hitstun' || actor.state === 'guardbreak')) {
            // Reaction states cannot act this step; keep edges queued so the press
            // fires on recovery instead of being consumed and silently dropped.
            return { ...current };
        }
        const useMobilityEdgeAxes = pending.mobilityPressed;
        const merged = {
            ...current,
            moveX: useMobilityEdgeAxes ? pending.moveX : current.moveX,
            moveZ: useMobilityEdgeAxes ? pending.moveZ : current.moveZ,
            lightPressed: pending.lightPressed,
            heavyPressed: pending.heavyPressed,
            mobilityPressed: pending.mobilityPressed,
            switchPressed: pending.switchPressed,
            guardPressed: pending.guardPressed
        };
        pending.lightPressed = false;
        pending.heavyPressed = false;
        pending.mobilityPressed = false;
        pending.switchPressed = false;
        pending.guardPressed = false;
        pending.moveX = 0;
        pending.moveZ = 0;
        return merged;
    }
    mergePlayerEdges(target, source) {
        const mobilityAlreadyPending = target.mobilityPressed;
        const attackAlreadyPending = target.lightPressed || target.heavyPressed;
        target.lightPressed ||= source.lightPressed;
        target.heavyPressed ||= source.heavyPressed;
        if (!attackAlreadyPending && source.mobilityPressed && !mobilityAlreadyPending) {
            target.mobilityPressed = true;
            target.moveX = source.moveX;
            target.moveZ = source.moveZ;
        }
        target.switchPressed ||= source.switchPressed;
        target.guardPressed ||= source.guardPressed;
    }
    clampActor(actor) {
        actor.x = clamp(actor.x, ARENA.minX + actor.radius, ARENA.maxX - actor.radius);
        actor.z = clamp(actor.z, ARENA.minZ + actor.radius * 0.35, ARENA.maxZ - actor.radius * 0.25);
    }
    resolveSeparation() {
        const living = this.actors.filter((actor) => actor.state !== 'dead');
        for (let firstIndex = 0; firstIndex < living.length; firstIndex += 1) {
            const first = living[firstIndex];
            if (!first)
                continue;
            for (let secondIndex = firstIndex + 1; secondIndex < living.length; secondIndex += 1) {
                const second = living[secondIndex];
                if (!second)
                    continue;
                const dx = second.x - first.x;
                const dz = second.z - first.z;
                const distance = Math.hypot(dx, dz);
                const minimum = (first.radius + second.radius) * 0.72;
                if (distance <= 0.001 || distance >= minimum)
                    continue;
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
    updatePermissions(dt) {
        this.permissionTimer -= dt;
        if (this.permissionTimer > 0)
            return;
        this.permissionTimer = 0.38;
        for (const enemy of this.enemyActors())
            enemy.attackPermission = enemy.archetype === 'grotesque';
        for (const player of this.playerActors().filter((actor) => actor.state !== 'dead')) {
            const candidates = this.enemyActors()
                .filter((enemy) => enemy.state !== 'dead' && enemy.archetype !== 'grotesque')
                .sort((left, right) => this.distanceSquared(left, player) - this.distanceSquared(right, player));
            let meleeSlots = 2;
            let reachSlots = 1;
            for (const enemy of candidates) {
                if (enemy.attackPermission)
                    continue;
                if (enemy.archetype === 'spear') {
                    if (reachSlots <= 0)
                        continue;
                    reachSlots -= 1;
                    enemy.attackPermission = true;
                }
                else {
                    if (meleeSlots <= 0)
                        continue;
                    meleeSlots -= 1;
                    enemy.attackPermission = true;
                }
                if (meleeSlots <= 0 && reachSlots <= 0)
                    break;
            }
        }
    }
    updateSpawns(dt) {
        this.spawnClock += dt;
        while (this.spawnQueue.length > 0 && (this.spawnQueue[0]?.at ?? Number.POSITIVE_INFINITY) <= this.spawnClock) {
            const entry = this.spawnQueue.shift();
            if (entry)
                this.spawnEnemy(entry.archetype);
        }
    }
    beginWave(index) {
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
        if (definition.boss)
            this.bossPhase = 1;
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
    spawnEnemy(archetype) {
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
    spawnWretch(x, z) {
        const enemy = createEnemy(this.nextActorId++, 'wretch', x, z);
        enemy.facing = x > 640 ? -1 : 1;
        this.actors.push(enemy);
    }
    checkWaveResolution(dt) {
        if (this.waveResolved || this.spawnQueue.length > 0)
            return;
        const enemiesAlive = this.enemyActors().some((actor) => actor.state !== 'dead');
        if (enemiesAlive) {
            this.clearTimer = 0;
            return;
        }
        this.clearTimer += dt;
        if (this.clearTimer < 1.05)
            return;
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
    checkDefeat() {
        if (this.playerActors().some((actor) => actor.state !== 'dead'))
            return;
        this.phase = 'defeat';
        this.waveTitle = 'The road takes another name.';
        this.emit({ type: 'defeat', text: this.waveTitle });
    }
    cleanupActors() {
        for (let index = this.actors.length - 1; index >= 0; index -= 1) {
            const actor = this.actors[index];
            if (!actor || actor.team === 'players')
                continue;
            if (actor.state === 'dead' && actor.deathTimer >= 1.15)
                this.actors.splice(index, 1);
        }
    }
    nearestLivingPlayer(actor) {
        let best = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const player of this.playerActors()) {
            if (player.state === 'dead')
                continue;
            const distance = this.distanceSquared(actor, player);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = player;
            }
        }
        return best;
    }
    playerActors() {
        return this.actors.filter((actor) => actor.team === 'players');
    }
    enemyActors() {
        return this.actors.filter((actor) => actor.team === 'enemies');
    }
    distanceSquared(left, right) {
        const dx = right.x - left.x;
        const dz = right.z - left.z;
        return dx * dx + dz * dz;
    }
    emit(event) {
        this.events.push(event);
    }
}
//# sourceMappingURL=world.js.map