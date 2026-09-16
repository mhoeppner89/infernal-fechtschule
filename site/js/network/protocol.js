import { GAME_SNAPSHOT_VERSION } from '../sim/types.js';
/**
 * One more than the last: this build's snapshots carry the shape of the road and
 * the fight on it (schema v9), which a peer from before cannot read. The version
 * belongs to the *pairing*, so a mixed pair is refused at the handshake instead
 * of silently dropping every packet.
 */
export const PEER_PROTOCOL_VERSION = 3;
const PHASES = new Set(['title', 'countdown', 'wave', 'lesson', 'victory', 'defeat']);
const TEAMS = new Set(['players', 'enemies']);
const ARCHETYPES = new Set(['meyer', 'thug', 'spear', 'captain', 'wretch', 'grotesque']);
const STATES = new Set(['idle', 'move', 'block', 'attack', 'dodge', 'crouch', 'jump', 'switch', 'hitstun', 'guardbreak', 'dead']);
const HIT_ZONES = new Set(['head', 'torso', 'legs']);
// Anything Meyer can be holding, including the finds he picks up off the road.
const WEAPONS = new Set(['longsword', 'dussack', 'club', 'spear']);
const FENCING_WEAPONS = new Set(['longsword', 'dussack']);
const ITEM_KINDS = new Set(['longsword', 'dussack', 'club', 'spear', 'potion']);
const SCENERY = new Set(['cobbled-streets', 'town-gate', 'sala-darmi', 'castello']);
const LESSONS = new Set([
    'ls-crossing',
    'ls-threefold',
    'ls-provoker',
    'ds-backhand',
    'ds-wheel',
    'switch-flourish'
]);
export function isPeerMessage(value) {
    if (!isRecord(value) || typeof value.type !== 'string')
        return false;
    switch (value.type) {
        case 'hello':
            return value.protocol === PEER_PROTOCOL_VERSION;
        case 'start':
            return isIntegerInRange(value.seed, 0, 0x7fffffff);
        case 'input':
            return isIntegerInRange(value.seq, 0, Number.MAX_SAFE_INTEGER) && isInputFrame(value.frame);
        case 'snapshot':
            return isSnapshot(value.snapshot);
        case 'lesson':
            return typeof value.id === 'string' && LESSONS.has(value.id);
        case 'restart':
            return true;
        case 'pause':
            return typeof value.paused === 'boolean';
        case 'ping':
        case 'pong':
            return isFiniteNumber(value.sentAt) && value.sentAt >= 0;
        default:
            return false;
    }
}
function isInputFrame(value) {
    if (!isRecord(value))
        return false;
    return isAxis(value.moveX) && isAxis(value.moveZ) &&
        typeof value.lightPressed === 'boolean' &&
        typeof value.heavyPressed === 'boolean' &&
        typeof value.mobilityPressed === 'boolean' &&
        typeof value.switchPressed === 'boolean' &&
        typeof value.guardHeld === 'boolean' &&
        typeof value.guardPressed === 'boolean';
}
function isSnapshot(value) {
    if (!isRecord(value))
        return false;
    if (value.version !== GAME_SNAPSHOT_VERSION || !isIntegerInRange(value.tick, 0, Number.MAX_SAFE_INTEGER))
        return false;
    if (!isFiniteNumber(value.time) || value.time < 0)
        return false;
    if (typeof value.phase !== 'string' || !PHASES.has(value.phase))
        return false;
    if (typeof value.waveTitle !== 'string' || value.waveTitle.length > 160)
        return false;
    if (typeof value.waveLabel !== 'string' || value.waveLabel.length > 64)
        return false;
    // The place a wave belongs to travels with it: it is what names the fight in
    // the HUD and picks the scenery, so a guest draws the same road as the host.
    if (!isIntegerInRange(value.levelIndex, 0, 8) || typeof value.levelName !== 'string' || value.levelName.length > 64)
        return false;
    if (value.scenery !== null && !SCENERY.has(value.scenery))
        return false;
    if (!isIntegerInRange(value.waveInLevel, 0, 64) || !isIntegerInRange(value.wavesInLevel, 1, 64))
        return false;
    if (!isFiniteNumber(value.score) || !isIntegerInRange(value.bossPhase, 0, 16))
        return false;
    if (!isFiniteNumber(value.cameraX) || !isFiniteNumber(value.roadWidth) || value.roadWidth <= 0)
        return false;
    // The shape of the road is what the guest clamps movement and draws the funnel
    // from, so it travels with the snapshot rather than being looked up per client.
    if (!isLane(value.lane))
        return false;
    // The open doorway is level state the guest draws, so it has to travel.
    if (typeof value.exitOpen !== 'boolean')
        return false;
    // And so is the stand clock, which the guest's HUD counts down.
    if (!isFiniteNumber(value.holdRemaining) || value.holdRemaining < 0)
        return false;
    if (!isLessonArray(value.lessons) || !isLessonArray(value.offeredLessons))
        return false;
    if (!Array.isArray(value.actors) || value.actors.length > 128)
        return false;
    if (!Array.isArray(value.items) || value.items.length > 64)
        return false;
    return value.actors.every(isActorSnapshot) && value.items.every(isItemSnapshot);
}
function isLane(value) {
    if (value === null)
        return true;
    if (!isRecord(value))
        return false;
    return isFiniteNumber(value.from) && isFiniteNumber(value.to) &&
        isFiniteNumber(value.minZ) && isFiniteNumber(value.maxZ) &&
        isFiniteNumber(value.approach) && value.approach >= 0;
}
function isItemSnapshot(value) {
    if (!isRecord(value))
        return false;
    return isIntegerInRange(value.id, 0, Number.MAX_SAFE_INTEGER) &&
        typeof value.kind === 'string' && ITEM_KINDS.has(value.kind) &&
        isFiniteNumber(value.x) && isFiniteNumber(value.z) && isFiniteNumber(value.y) &&
        isIntegerInRange(value.durability, 0, 99) &&
        typeof value.thrown === 'boolean' &&
        isFiniteNumber(value.age) && value.age >= 0;
}
function isActorSnapshot(value) {
    if (!isRecord(value))
        return false;
    return isIntegerInRange(value.id, 0, Number.MAX_SAFE_INTEGER) &&
        typeof value.team === 'string' && TEAMS.has(value.team) &&
        typeof value.archetype === 'string' && ARCHETYPES.has(value.archetype) &&
        typeof value.name === 'string' && value.name.length <= 96 &&
        (value.playerIndex === null || isIntegerInRange(value.playerIndex, 0, 3)) &&
        isFiniteNumber(value.x) && isFiniteNumber(value.z) &&
        isFiniteNumber(value.vx) && isFiniteNumber(value.vz) &&
        (value.facing === -1 || value.facing === 1) &&
        isFiniteNumber(value.radius) && value.radius >= 0 && value.radius <= 256 &&
        isFiniteNumber(value.health) && isFiniteNumber(value.maxHealth) && value.maxHealth >= 0 &&
        isFiniteNumber(value.guard) && isFiniteNumber(value.maxGuard) && value.maxGuard >= 0 &&
        isFiniteNumber(value.armor) && isFiniteNumber(value.maxArmor) && value.maxArmor >= 0 &&
        typeof value.state === 'string' && STATES.has(value.state) &&
        isFiniteNumber(value.stateElapsed) && isFiniteNumber(value.stateDuration) &&
        isAxis(value.stateMoveX) && isAxis(value.stateMoveZ) &&
        typeof value.weapon === 'string' && WEAPONS.has(value.weapon) &&
        typeof value.desiredWeapon === 'string' && WEAPONS.has(value.desiredWeapon) &&
        typeof value.stowedWeapon === 'string' && FENCING_WEAPONS.has(value.stowedWeapon) &&
        isIntegerInRange(value.durability, 0, 99) &&
        (value.attackId === null || (typeof value.attackId === 'string' && value.attackId.length <= 64)) &&
        isFiniteNumber(value.attackElapsed) &&
        isFiniteNumber(value.invulnerable) && isFiniteNumber(value.openingTimer) &&
        isFiniteNumber(value.provokeTimer) && isFiniteNumber(value.counterWindow) &&
        isFiniteNumber(value.flashTimer) && isIntegerInRange(value.comboCount, 0, 9999) &&
        (value.reactionZone === null || (typeof value.reactionZone === 'string' && HIT_ZONES.has(value.reactionZone))) &&
        isFiniteNumber(value.deathTimer) && value.deathTimer >= 0;
}
function isLessonArray(value) {
    return Array.isArray(value) && value.length <= LESSONS.size && value.every((id) => typeof id === 'string' && LESSONS.has(id));
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
}
function isIntegerInRange(value, minimum, maximum) {
    return Number.isInteger(value) && value >= minimum && value <= maximum;
}
function isAxis(value) {
    return isFiniteNumber(value) && value >= -1.25 && value <= 1.25;
}
//# sourceMappingURL=protocol.js.map