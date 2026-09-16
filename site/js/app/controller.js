import { AudioEngine } from '../audio/audio.js';
import { InputHub } from '../input/input.js';
import { ManualPeerSession } from '../network/manual-peer.js';
import { CanvasRenderer } from '../render/canvas-renderer.js';
import { ATTACKS } from '../sim/attacks.js';
import { GameWorld, titleSnapshot } from '../sim/world.js';
import { NEUTRAL_INPUT } from '../sim/types.js';
import { GameUI } from '../ui/ui.js';
const FIXED_STEP = 1 / 60;
const GUEST_SNAPSHOT_PERIOD = 1 / 20;
const MAX_GUEST_SNAPSHOT_PERIOD = 0.15;
const CONTINUOUS_ANIMATION_STATES = new Set(['idle', 'move', 'block', 'crouch']);
export class GameController {
    renderer;
    ui = new GameUI();
    input;
    audio = new AudioEngine();
    peer = new ManualPeerSession();
    world = null;
    guestSnapshot = null;
    guestPreviousSnapshot = null;
    guestPresentedSnapshot = null;
    guestPresentationElapsed = 0;
    guestSnapshotPeriod = GUEST_SNAPSHOT_PERIOD;
    mode = 'title';
    paused = false;
    running = false;
    lastFrameTime = 0;
    accumulator = 0;
    networkAccumulator = 0;
    inputSequence = 0;
    pendingLocal = cloneInput(NEUTRAL_INPUT);
    pendingRemote = cloneInput(NEUTRAL_INPUT);
    lastRemoteAt = 0;
    localPlayerIndex = 0;
    lastUiPhase = '';
    manualClock = false;
    constructor(canvas, controlRoot) {
        const debug = new URLSearchParams(location.search).has('debug');
        this.renderer = new CanvasRenderer(canvas, debug);
        this.input = new InputHub(controlRoot);
        this.bindUi();
        this.bindPeer();
        this.bindPauseKeys();
        this.renderTitleBackdrop();
        const params = new URLSearchParams(location.search);
        if (params.get('autostart') === '1') {
            // Automated captures do not have a user gesture, so Web Audio cannot
            // resume. Muting keeps the deterministic browser hook from stalling.
            this.audio.setMuted(true);
            const seedParam = params.get('seed');
            const requestedSeed = seedParam === null ? Number.NaN : Number(seedParam);
            const seed = Number.isInteger(requestedSeed) ? requestedSeed : undefined;
            window.setTimeout(() => this.startSolo(params.get('skipCountdown') === '1', seed), 60);
        }
    }
    getSnapshot() {
        return this.mode === 'guest'
            ? this.guestPresentedSnapshot ?? this.guestSnapshot
            : this.world?.snapshot() ?? null;
    }
    advanceTime(milliseconds) {
        this.manualClock = true;
        const steps = Math.max(1, Math.min(600, Math.round(Math.max(0, milliseconds) / (FIXED_STEP * 1000))));
        for (let index = 0; index < steps; index += 1) {
            const sampled = this.input.sample(FIXED_STEP);
            this.mergeIntoPending(this.pendingLocal, sampled);
            if (!this.paused) {
                if (this.mode === 'guest')
                    this.updateGuest(FIXED_STEP, sampled);
                else
                    this.updateAuthority(FIXED_STEP);
            }
            // Render every fixed step. Besides making captures match the real 60 Hz
            // presentation, this advances sparks, hit flashes, and damage text at the
            // same rate as combat instead of leaving them frozen across long probes.
            this.renderCurrentSnapshot(this.paused ? 0 : FIXED_STEP);
        }
    }
    renderGameToText() {
        const snapshot = this.getSnapshot();
        if (!snapshot)
            return JSON.stringify({ mode: this.mode, phase: 'title' });
        return JSON.stringify({
            coordinates: 'origin top-left; x increases right; z increases downstage',
            mode: this.mode,
            paused: this.paused,
            phase: snapshot.phase,
            tick: snapshot.tick,
            time: Number(snapshot.time.toFixed(3)),
            wave: {
                level: snapshot.levelIndex,
                levelName: snapshot.levelName,
                inLevel: snapshot.waveInLevel,
                ofLevel: snapshot.wavesInLevel,
                title: snapshot.waveTitle,
                label: snapshot.waveLabel,
                bossPhase: snapshot.bossPhase
            },
            camera: { x: Math.round(snapshot.cameraX), roadWidth: Math.round(snapshot.roadWidth) },
            score: snapshot.score,
            animationAssets: this.renderer.getAnimationReadiness(),
            backgroundAssets: this.renderer.getBackgroundReadiness(),
            actors: snapshot.actors.filter((actor) => actor.state !== 'dead' || actor.deathTimer < actor.stateDuration).map((actor) => ({
                id: actor.id,
                team: actor.team,
                archetype: actor.archetype,
                x: Math.round(actor.x),
                z: Math.round(actor.z),
                facing: actor.facing,
                health: Math.round(actor.health),
                guard: Math.round(actor.guard),
                armor: Math.round(actor.armor),
                state: actor.state,
                crouching: actor.state === 'crouch' || (actor.state === 'attack' &&
                    actor.attackId !== null &&
                    ATTACKS[actor.attackId]?.crouchedPosture === true),
                stateElapsed: Number(actor.stateElapsed.toFixed(3)),
                weapon: actor.weapon,
                durability: actor.durability,
                attackId: actor.attackId,
                hitZone: actor.attackId ? ATTACKS[actor.attackId]?.hitZone ?? null : null,
                attackElapsed: Number(actor.attackElapsed.toFixed(3)),
                reactionZone: actor.reactionZone,
                comboCount: actor.comboCount
            })),
            items: snapshot.items.map((item) => ({
                kind: item.kind,
                x: Math.round(item.x),
                z: Math.round(item.z),
                y: Number(item.y.toFixed(1)),
                durability: item.durability,
                thrown: item.thrown
            }))
        });
    }
    bindUi() {
        this.ui.bind({
            startSolo: () => this.startSolo(false),
            enableTilt: () => this.input.tilt.requestPermissionAndEnable(),
            recenterTilt: () => this.input.tilt.recenter(),
            chooseLesson: (id) => this.chooseLesson(id),
            restart: () => this.restart(),
            returnToTitle: () => this.returnToTitle(),
            togglePause: () => this.togglePause(),
            generateHostOffer: () => this.peer.createHostOffer(),
            applyHostAnswer: (token) => this.peer.acceptAnswer(token),
            createGuestAnswer: (token) => this.peer.acceptOfferAndCreateAnswer(token),
            startHostRun: () => this.startHostRun()
        });
    }
    bindPeer() {
        this.peer.onStatus = (status) => this.ui.setNetworkStatus(status);
        this.peer.onOpen = () => this.ui.setPeerConnected(true);
        this.peer.onClose = () => this.ui.setPeerConnected(false);
        this.peer.onMessage = (message) => this.handlePeerMessage(message);
    }
    /** Escape toggles pause once a run exists, matching the documented control. */
    bindPauseKeys() {
        window.addEventListener('keydown', (event) => {
            if (event.code !== 'Escape' || event.repeat)
                return;
            event.preventDefault();
            this.togglePause();
        });
    }
    async startSolo(skipCountdown, seed) {
        await this.audio.unlock();
        this.mode = 'solo';
        this.localPlayerIndex = 0;
        this.world = new GameWorld({
            playerCount: 1,
            seed: seed ?? (Date.now() & 0x7fffffff),
            skipCountdown
        });
        this.guestSnapshot = null;
        this.resetGuestPresentation();
        this.startRunLoop();
    }
    async startHostRun() {
        if (!this.peer.connected) {
            this.ui.setNetworkStatus('Connect the guest before starting the run.');
            return;
        }
        await this.audio.unlock();
        const seed = Date.now() & 0x7fffffff;
        this.mode = 'host';
        this.localPlayerIndex = 0;
        this.world = new GameWorld({ playerCount: 2, seed });
        this.guestSnapshot = null;
        this.resetGuestPresentation();
        this.peer.send({ type: 'start', seed });
        this.startRunLoop();
    }
    async startGuestRun(seed) {
        await this.audio.unlock();
        this.mode = 'guest';
        this.localPlayerIndex = 1;
        this.world = null;
        this.guestSnapshot = null;
        this.resetGuestPresentation();
        this.startRunLoop();
        this.ui.setNetworkStatus(`Co-op run started (seed ${seed}).`);
    }
    startRunLoop() {
        this.paused = false;
        this.accumulator = 0;
        this.networkAccumulator = 0;
        this.pendingLocal = cloneInput(NEUTRAL_INPUT);
        this.pendingRemote = cloneInput(NEUTRAL_INPUT);
        this.lastUiPhase = '';
        this.input.reset();
        this.ui.hideLesson();
        this.ui.showGame();
        if (!this.running) {
            this.running = true;
            this.lastFrameTime = performance.now();
            requestAnimationFrame((time) => this.frame(time));
        }
    }
    frame(now) {
        if (!this.running)
            return;
        const dt = Math.min(0.05, Math.max(0, (now - this.lastFrameTime) / 1000));
        this.lastFrameTime = now;
        if (!this.manualClock) {
            const sampled = this.input.sample(dt || FIXED_STEP);
            this.mergeIntoPending(this.pendingLocal, sampled);
            if (!this.paused) {
                if (this.mode === 'guest')
                    this.updateGuest(dt, sampled);
                else
                    this.updateAuthority(dt);
            }
        }
        this.renderCurrentSnapshot(this.manualClock ? 0 : dt || FIXED_STEP);
        requestAnimationFrame((time) => this.frame(time));
    }
    renderCurrentSnapshot(dt) {
        const snapshot = this.mode === 'guest'
            ? this.updateGuestPresentation(dt)
            : this.world?.snapshot() ?? null;
        if (!snapshot)
            return;
        this.renderer.render(snapshot, dt);
        this.ui.update(snapshot, this.localPlayerIndex);
        this.syncOverlayToSnapshot(snapshot);
    }
    updateAuthority(dt) {
        const world = this.world;
        if (!world)
            return;
        this.accumulator += dt;
        // Preserve edge-triggered inputs on high-refresh displays until at least one
        // fixed simulation step is available. Consuming them every render frame
        // would lose taps on 90 Hz and 120 Hz phones.
        if (this.accumulator >= FIXED_STEP) {
            const local = this.consumePending(this.pendingLocal);
            let remote = this.consumePending(this.pendingRemote);
            if (this.mode === 'host' && performance.now() - this.lastRemoteAt > 700) {
                remote = cloneInput(NEUTRAL_INPUT);
            }
            let firstStep = true;
            while (this.accumulator >= FIXED_STEP) {
                const input0 = firstStep ? local : InputHub.withoutEdges(local);
                const input1 = firstStep ? remote : InputHub.withoutEdges(remote);
                world.step(FIXED_STEP, this.mode === 'host' ? [input0, input1] : [input0]);
                this.handleWorldEvents(world.consumeEvents());
                this.accumulator -= FIXED_STEP;
                firstStep = false;
            }
        }
        if (this.mode === 'host' && this.peer.connected) {
            this.networkAccumulator += dt;
            if (this.networkAccumulator >= 1 / 20) {
                this.networkAccumulator %= 1 / 20;
                this.peer.send({ type: 'snapshot', snapshot: world.snapshot() });
            }
        }
    }
    updateGuest(dt, sampled) {
        if (!this.peer.connected)
            return;
        this.networkAccumulator += dt;
        const hasEdge = sampled.lightPressed || sampled.heavyPressed || sampled.mobilityPressed || sampled.switchPressed || sampled.guardPressed;
        if (hasEdge || this.networkAccumulator >= 1 / 30) {
            this.networkAccumulator = 0;
            this.peer.send({ type: 'input', seq: this.inputSequence++, frame: this.consumePending(this.pendingLocal) });
        }
    }
    handleWorldEvents(events) {
        for (const event of events) {
            this.renderer.handle(event);
            this.audio.handle(event);
            if (event.type === 'ambush') {
                // The trap is the one event the player has to hear about immediately:
                // the wall behind them is about to stop being a wall.
                this.ui.showBanner(event.text ?? 'AMBUSH', event.subtitle ?? 'They are at your back.', 2200);
            }
            else if (event.type === 'wave-clear') {
                // The rule this project plays by is worth saying out loud the moment it
                // applies: the place is clear, the way out runs east, and walking it is
                // the player's call to make. It only fires at the end of a *level* — the
                // waves inside one hand off to each other without a doorway in between.
                this.ui.showBanner('LEVEL CLEAR', 'The road runs east — walk it when you are ready.', 1600);
            }
            else if (event.type === 'banner' && event.text) {
                // A wave opens with the place, which fight of it this is, the fight's
                // name and what it is asking. With nothing read out in a corner, this
                // announcement is the only place the journey's names appear, so it stays
                // long enough to read rather than flashing past like a hit marker.
                // The place and which fight of it this is come off the snapshot, and the
                // fight's own words come off the event: the sim knows the campaign, so
                // the DOM layer never looks a wave up for itself.
                const snapshot = this.getSnapshot();
                const note = snapshot
                    ? `${snapshot.levelName} · WAVE ${snapshot.waveInLevel + 1} OF ${snapshot.wavesInLevel}`
                    : '';
                this.ui.showBanner(event.text, event.subtitle ?? '', 2600, note);
            }
            else if (event.type === 'lesson-offer' && event.lessons) {
                this.ui.showLesson(event.lessons, true);
            }
            else if (event.type === 'lesson-chosen') {
                this.ui.hideLesson();
            }
            else if (event.type === 'boss-phase' && event.text) {
                this.ui.showBanner('THE CHAINS TEAR', event.text);
            }
            else if (event.type === 'victory') {
                this.ui.showEnd(true, event.text ?? 'A darker master waits down the road.');
            }
            else if (event.type === 'defeat') {
                this.ui.showEnd(false, event.text ?? 'The lesson ends in the dust.');
            }
        }
    }
    syncOverlayToSnapshot(snapshot) {
        if (snapshot.phase === this.lastUiPhase)
            return;
        this.lastUiPhase = snapshot.phase;
        if (snapshot.phase === 'lesson') {
            this.ui.showLesson(snapshot.offeredLessons, this.mode !== 'guest');
        }
        else {
            this.ui.hideLesson();
        }
        if (snapshot.phase === 'victory') {
            this.ui.showEnd(true, snapshot.waveTitle);
        }
        else if (snapshot.phase === 'defeat') {
            this.ui.showEnd(false, snapshot.waveTitle);
        }
    }
    handlePeerMessage(message) {
        switch (message.type) {
            case 'start':
                void this.startGuestRun(message.seed);
                break;
            case 'input':
                if (this.mode === 'host') {
                    this.mergeIntoPending(this.pendingRemote, message.frame);
                    this.lastRemoteAt = performance.now();
                }
                break;
            case 'snapshot':
                if (this.mode === 'guest')
                    this.acceptGuestSnapshot(message.snapshot);
                break;
            case 'lesson':
                if (this.mode === 'host')
                    this.chooseLesson(message.id);
                break;
            case 'restart':
                if (this.mode === 'host')
                    void this.startHostRun();
                break;
            case 'pause':
                if (this.mode === 'host') {
                    this.setPaused(message.paused);
                    this.peer.send(message);
                }
                else if (this.mode === 'guest') {
                    this.setPaused(message.paused);
                }
                break;
            case 'ping':
                this.peer.send({ type: 'pong', sentAt: message.sentAt });
                break;
            case 'hello':
            case 'pong':
                break;
        }
    }
    chooseLesson(id) {
        if (this.mode === 'guest') {
            this.peer.send({ type: 'lesson', id });
            return;
        }
        if (this.world?.chooseLesson(id))
            this.ui.hideLesson();
    }
    restart() {
        if (this.mode === 'guest') {
            this.peer.send({ type: 'restart' });
            return;
        }
        if (this.mode === 'host') {
            void this.startHostRun();
            return;
        }
        void this.startSolo(false);
    }
    returnToTitle() {
        this.mode = 'title';
        this.world = null;
        this.guestSnapshot = null;
        this.resetGuestPresentation();
        this.paused = false;
        this.peer.close();
        this.ui.setPeerConnected(false);
        this.input.reset();
        this.ui.showTitle();
        this.renderTitleBackdrop();
    }
    togglePause() {
        if (this.mode === 'title')
            return;
        const next = !this.paused;
        if (this.mode === 'guest') {
            this.setPaused(next);
            this.peer.send({ type: 'pause', paused: next });
            return;
        }
        this.setPaused(next);
        if (this.mode === 'host')
            this.peer.send({ type: 'pause', paused: next });
    }
    setPaused(paused) {
        this.paused = paused;
        this.pendingLocal = cloneInput(NEUTRAL_INPUT);
        this.pendingRemote = cloneInput(NEUTRAL_INPUT);
        this.input.reset();
        this.ui.showPause(paused);
    }
    mergeIntoPending(target, source) {
        const mobilityAlreadyPending = target.mobilityPressed;
        if (!mobilityAlreadyPending) {
            target.moveX = source.moveX;
            target.moveZ = source.moveZ;
        }
        target.guardHeld = source.guardHeld;
        const attackAlreadyPending = target.lightPressed || target.heavyPressed;
        target.lightPressed ||= source.lightPressed;
        target.heavyPressed ||= source.heavyPressed;
        // InputHub only emits Duck+Attack together when Duck happened first. Keep
        // that order and its movement vector when several render samples collapse
        // into one fixed step.
        if (!attackAlreadyPending && source.mobilityPressed && !mobilityAlreadyPending) {
            target.mobilityPressed = true;
            target.moveX = source.moveX;
            target.moveZ = source.moveZ;
        }
        target.switchPressed ||= source.switchPressed;
        target.guardPressed ||= source.guardPressed;
    }
    consumePending(target) {
        const result = { ...target };
        target.lightPressed = false;
        target.heavyPressed = false;
        target.mobilityPressed = false;
        target.switchPressed = false;
        target.guardPressed = false;
        return result;
    }
    acceptGuestSnapshot(snapshot) {
        const latest = this.guestSnapshot;
        // The data channel is ordered, but ignoring an old duplicate here keeps the
        // presentation clock monotonic if a transport implementation ever retries.
        if (latest && snapshot.tick <= latest.tick)
            return;
        this.guestPreviousSnapshot = latest;
        this.guestSnapshot = snapshot;
        this.guestPresentationElapsed = 0;
        this.guestSnapshotPeriod = latest
            ? clamp((snapshot.tick - latest.tick) * FIXED_STEP, FIXED_STEP, MAX_GUEST_SNAPSHOT_PERIOD)
            : GUEST_SNAPSHOT_PERIOD;
        if (!this.guestPresentedSnapshot) {
            this.guestPresentedSnapshot = interpolateGuestSnapshot(latest, snapshot, 0, this.guestSnapshotPeriod);
        }
    }
    updateGuestPresentation(dt) {
        const latest = this.guestSnapshot;
        if (!latest)
            return null;
        const safeDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
        this.guestPresentationElapsed += safeDt;
        const next = interpolateGuestSnapshot(this.guestPreviousSnapshot, latest, this.guestPresentationElapsed, this.guestSnapshotPeriod);
        if (this.guestPresentedSnapshot) {
            preserveContinuousAnimationClocks(next, this.guestPresentedSnapshot, safeDt);
        }
        this.guestPresentedSnapshot = next;
        return this.guestPresentedSnapshot;
    }
    resetGuestPresentation() {
        this.guestPreviousSnapshot = null;
        this.guestPresentedSnapshot = null;
        this.guestPresentationElapsed = 0;
        this.guestSnapshotPeriod = GUEST_SNAPSHOT_PERIOD;
    }
    /**
     * The view before the run starts: the world with nobody in it. The snapshot
     * itself comes from the sim (`titleSnapshot`), so the title card cannot fall a
     * schema version behind the game it is previewing.
     */
    renderTitleBackdrop() {
        this.renderer.render(titleSnapshot(), FIXED_STEP);
    }
}
function cloneInput(frame) {
    return { ...frame };
}
/**
 * Creates a render-only guest snapshot without mutating either authoritative
 * network snapshot. Position and matching animation clocks interpolate across
 * one host packet. Only looping states may advance past the newest packet;
 * attacks and reactions stop at the last authoritative clock value.
 */
export function interpolateGuestSnapshot(previous, latest, elapsed, snapshotPeriod) {
    const safeElapsed = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
    const safePeriod = Number.isFinite(snapshotPeriod)
        ? clamp(snapshotPeriod, FIXED_STEP, MAX_GUEST_SNAPSHOT_PERIOD)
        : GUEST_SNAPSHOT_PERIOD;
    const alpha = previous ? clamp(safeElapsed / safePeriod, 0, 1) : 1;
    // Wait for a second packet before predicting presentation time. Advancing the
    // first packet would force its loop clock backwards when that second packet
    // establishes the interpolation interval.
    const loopClockExtra = previous ? Math.max(0, safeElapsed - safePeriod) : 0;
    const base = previous && alpha < 1 ? previous : latest;
    const previousActors = new Map(previous?.actors.map((actor) => [actor.id, actor]) ?? []);
    const actors = latest.actors.map((latestActor) => {
        const previousActor = previousActors.get(latestActor.id);
        if (!previousActor) {
            return advanceContinuousAnimationClock({ ...latestActor }, loopClockExtra);
        }
        const sameAnimation = hasSameAnimation(previousActor, latestActor) &&
            latestActor.stateElapsed >= previousActor.stateElapsed &&
            latestActor.attackElapsed >= previousActor.attackElapsed;
        const actorBase = alpha < 1 ? previousActor : latestActor;
        const presented = {
            ...actorBase,
            x: lerp(previousActor.x, latestActor.x, alpha),
            z: lerp(previousActor.z, latestActor.z, alpha)
        };
        if (sameAnimation) {
            presented.stateElapsed = lerp(previousActor.stateElapsed, latestActor.stateElapsed, alpha);
            presented.attackElapsed = lerp(previousActor.attackElapsed, latestActor.attackElapsed, alpha);
        }
        if (alpha >= 1)
            advanceContinuousAnimationClock(presented, loopClockExtra);
        return presented;
    });
    const timeAdvanced = previous && latest.time >= previous.time
        ? lerp(previous.time, latest.time, alpha)
        : base.time;
    const cameraAdvanced = previous && latest.cameraX >= previous.cameraX
        ? lerp(previous.cameraX, latest.cameraX, alpha)
        : base.cameraX;
    return {
        ...base,
        time: timeAdvanced,
        cameraX: cameraAdvanced,
        lessons: [...base.lessons],
        offeredLessons: [...base.offeredLessons],
        actors
    };
}
function hasSameAnimation(previous, latest) {
    return previous.state === latest.state &&
        previous.attackId === latest.attackId &&
        previous.reactionZone === latest.reactionZone &&
        previous.weapon === latest.weapon &&
        previous.desiredWeapon === latest.desiredWeapon;
}
function advanceContinuousAnimationClock(actor, elapsed) {
    if (CONTINUOUS_ANIMATION_STATES.has(actor.state))
        actor.stateElapsed += elapsed;
    return actor;
}
function preserveContinuousAnimationClocks(next, previousPresentation, dt) {
    const previousActors = new Map(previousPresentation.actors.map((actor) => [actor.id, actor]));
    for (const actor of next.actors) {
        const previousActor = previousActors.get(actor.id);
        if (!previousActor ||
            !CONTINUOUS_ANIMATION_STATES.has(actor.state) ||
            !hasSameAnimation(previousActor, actor))
            continue;
        actor.stateElapsed = Math.max(actor.stateElapsed, previousActor.stateElapsed + dt);
    }
}
function lerp(from, to, amount) {
    return from + (to - from) * amount;
}
function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
}
//# sourceMappingURL=controller.js.map