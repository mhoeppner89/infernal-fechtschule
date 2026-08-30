import { AudioEngine } from '../audio/audio.js';
import { InputHub } from '../input/input.js';
import { ManualPeerSession } from '../network/manual-peer.js';
import { CanvasRenderer } from '../render/canvas-renderer.js';
import { WAVES } from '../sim/waves.js';
import { GameWorld } from '../sim/world.js';
import { NEUTRAL_INPUT } from '../sim/types.js';
import { GameUI } from '../ui/ui.js';
const FIXED_STEP = 1 / 60;
export class GameController {
    renderer;
    ui = new GameUI();
    input;
    audio = new AudioEngine();
    peer = new ManualPeerSession();
    world = null;
    guestSnapshot = null;
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
    constructor(canvas, controlRoot) {
        const debug = new URLSearchParams(location.search).has('debug');
        this.renderer = new CanvasRenderer(canvas, debug);
        this.input = new InputHub(controlRoot);
        this.bindUi();
        this.bindPeer();
        this.renderTitleBackdrop();
        const params = new URLSearchParams(location.search);
        if (params.get('autostart') === '1') {
            window.setTimeout(() => this.startSolo(params.get('skipCountdown') === '1'), 60);
        }
    }
    getSnapshot() {
        return this.mode === 'guest' ? this.guestSnapshot : this.world?.snapshot() ?? null;
    }
    bindUi() {
        this.ui.bind({
            startSolo: () => this.startSolo(false),
            enableTilt: () => this.input.tilt.requestPermissionAndEnable(),
            recenterTilt: () => this.input.tilt.recenter(),
            chooseUpgrade: (id) => this.chooseUpgrade(id),
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
    async startSolo(skipCountdown) {
        await this.audio.unlock();
        this.mode = 'solo';
        this.localPlayerIndex = 0;
        this.world = new GameWorld({ playerCount: 1, seed: Date.now() & 0x7fffffff, skipCountdown });
        this.guestSnapshot = null;
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
        this.peer.send({ type: 'start', seed });
        this.startRunLoop();
    }
    async startGuestRun(seed) {
        await this.audio.unlock();
        this.mode = 'guest';
        this.localPlayerIndex = 1;
        this.world = null;
        this.guestSnapshot = null;
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
        this.ui.hideUpgrade();
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
        const sampled = this.input.sample(dt || FIXED_STEP);
        this.mergeIntoPending(this.pendingLocal, sampled);
        if (!this.paused) {
            if (this.mode === 'guest')
                this.updateGuest(dt, sampled);
            else
                this.updateAuthority(dt);
        }
        const snapshot = this.getSnapshot();
        if (snapshot) {
            this.renderer.render(snapshot, dt || FIXED_STEP);
            this.ui.update(snapshot, this.localPlayerIndex);
            this.syncOverlayToSnapshot(snapshot);
        }
        requestAnimationFrame((time) => this.frame(time));
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
            if (event.type === 'banner' && event.text) {
                const wave = WAVES[this.world?.waveIndex ?? -1];
                this.ui.showBanner(event.text, wave?.subtitle ?? '');
            }
            else if (event.type === 'upgrade-offer' && event.upgrades) {
                this.ui.showUpgrade(event.upgrades, true);
            }
            else if (event.type === 'upgrade-chosen') {
                this.ui.hideUpgrade();
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
        if (snapshot.phase === 'upgrade') {
            this.ui.showUpgrade(snapshot.offeredUpgrades, this.mode !== 'guest');
        }
        else {
            this.ui.hideUpgrade();
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
                    this.guestSnapshot = message.snapshot;
                break;
            case 'upgrade':
                if (this.mode === 'host')
                    this.chooseUpgrade(message.id);
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
    chooseUpgrade(id) {
        if (this.mode === 'guest') {
            this.peer.send({ type: 'upgrade', id });
            return;
        }
        if (this.world?.chooseUpgrade(id))
            this.ui.hideUpgrade();
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
        target.moveX = source.moveX;
        target.moveZ = source.moveZ;
        target.guardHeld = source.guardHeld;
        target.lightPressed ||= source.lightPressed;
        target.heavyPressed ||= source.heavyPressed;
        target.mobilityPressed ||= source.mobilityPressed;
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
    renderTitleBackdrop() {
        const backdrop = {
            version: 1,
            tick: 0,
            time: 0,
            phase: 'title',
            waveIndex: -1,
            waveTitle: 'Meyer Crosses the Alps',
            score: 0,
            bossPhase: 0,
            upgrades: [],
            offeredUpgrades: [],
            actors: []
        };
        this.renderer.render(backdrop, FIXED_STEP);
    }
}
function cloneInput(frame) {
    return { ...frame };
}
//# sourceMappingURL=controller.js.map