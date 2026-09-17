import { LESSONS } from '../sim/lessons.js';
import { LESSON_ROUTES } from '../sim/attacks.js';
import { ITEM_REACH_STATES, itemWithinReach } from '../sim/world.js';
const ITEM_TAKE_LABELS = Object.freeze({
    potion: 'DRINK DRAUGHT',
    club: 'TAKE CUDGEL',
    spear: 'TAKE SHAFT',
    longsword: 'TAKE LONGSWORD',
    dussack: 'TAKE DUSSACK'
});
const WEAPON_LABELS = Object.freeze({
    longsword: 'LONGSWORD',
    dussack: 'DUSSACK',
    club: 'CUDGEL',
    spear: 'SPEAR'
});
export class GameUI {
    titleScreen = requireElement('title-screen');
    gameHud = requireElement('game-hud');
    touchControls = requireElement('touch-controls');
    banner = requireElement('banner');
    bannerTitle = requireElement('banner-title');
    bannerSubtitle = requireElement('banner-subtitle');
    bannerNote = requireElement('banner-note');
    waveLabel = requireElement('wave-label');
    waveContext = requireElement('wave-context');
    waveObjective = requireElement('wave-objective');
    wavePrompt = requireElement('wave-prompt');
    takePrompt = requireElement('take-prompt');
    doctrine = requireElement('doctrine');
    comboCount = requireElement('combo-count');
    routeCue = requireElement('route-cue');
    playerVitals = requireElement('player-vitals');
    playerLabel = requireElement('player-label');
    playerWeapon = requireElement('player-weapon');
    healthBar = requireElement('health-bar');
    healthFill = requireElement('health-fill');
    healthValue = requireElement('health-value');
    guardBar = requireElement('guard-bar');
    guardFill = requireElement('guard-fill');
    guardValue = requireElement('guard-value');
    switchButton = requireElement('switch-button');
    switchLabel = requireElement('switch-label');
    uiAnnouncer = requireElement('ui-announcer');
    lessonOverlay = requireElement('lesson-overlay');
    lessonCards = requireElement('lesson-cards');
    endOverlay = requireElement('end-overlay');
    endTitle = requireElement('end-title');
    endCopy = requireElement('end-copy');
    pauseOverlay = requireElement('pause-overlay');
    networkOverlay = requireElement('network-overlay');
    guideOverlay = requireElement('guide-overlay');
    guideClose = requireElement('close-guide');
    networkStatus = requireElement('network-status');
    hostOffer = requireElement('host-offer');
    hostAnswer = requireElement('host-answer');
    guestOffer = requireElement('guest-offer');
    guestAnswer = requireElement('guest-answer');
    hostStart = requireElement('host-start');
    tiltStatus = requireElement('tilt-status');
    lessonWaiting = requireElement('lesson-waiting');
    callbacks = null;
    bannerTimeout = 0;
    guideReturnFocus = null;
    guidePausedRun = false;
    lastAnnouncedWave = '';
    lastAnnouncedWeapon = '';
    lastRouteCue = '';
    bind(callbacks) {
        this.callbacks = callbacks;
        requireElement('start-solo').addEventListener('click', () => callbacks.startSolo());
        requireElement('practice-button').addEventListener('click', () => this.openGuide(false));
        requireElement('open-network').addEventListener('click', () => this.networkOverlay.classList.remove('is-hidden'));
        requireElement('close-network').addEventListener('click', () => this.networkOverlay.classList.add('is-hidden'));
        requireElement('guide-button').addEventListener('click', () => this.openGuide(true));
        this.guideClose.addEventListener('click', () => this.closeGuide());
        window.addEventListener('keydown', (event) => {
            if (event.code !== 'Escape' || this.guideOverlay.classList.contains('is-hidden'))
                return;
            event.preventDefault();
            event.stopImmediatePropagation();
            this.closeGuide();
        });
        requireElement('enable-tilt').addEventListener('click', async () => {
            try {
                this.setTiltStatus('Requesting motion permission…');
                this.setTiltStatus(await callbacks.enableTilt());
            }
            catch (error) {
                this.setTiltStatus(error instanceof Error ? error.message : 'Tilt could not be enabled.');
            }
        });
        requireElement('recenter-tilt').addEventListener('click', () => {
            callbacks.recenterTilt();
            this.setTiltStatus('Tilt centred at the current phone angle.');
        });
        requireElement('pause-button').addEventListener('click', () => callbacks.togglePause());
        requireElement('resume-button').addEventListener('click', () => callbacks.togglePause());
        requireElement('restart-button').addEventListener('click', () => callbacks.restart());
        requireElement('end-restart').addEventListener('click', () => callbacks.restart());
        requireElement('end-title-button').addEventListener('click', () => callbacks.returnToTitle());
        requireElement('pause-title-button').addEventListener('click', () => callbacks.returnToTitle());
        requireElement('host-generate').addEventListener('click', async () => {
            await this.runNetworkAction(async () => {
                this.hostOffer.value = await callbacks.generateHostOffer();
            });
        });
        requireElement('host-apply-answer').addEventListener('click', async () => {
            await this.runNetworkAction(async () => callbacks.applyHostAnswer(this.hostAnswer.value));
        });
        requireElement('guest-generate-answer').addEventListener('click', async () => {
            await this.runNetworkAction(async () => {
                this.guestAnswer.value = await callbacks.createGuestAnswer(this.guestOffer.value);
            });
        });
        this.hostStart.addEventListener('click', () => callbacks.startHostRun());
        for (const button of document.querySelectorAll('[data-copy-target]')) {
            button.addEventListener('click', async () => {
                const targetId = button.dataset.copyTarget;
                const target = targetId ? document.getElementById(targetId) : null;
                if (!target?.value)
                    return;
                await navigator.clipboard.writeText(target.value);
                button.textContent = 'Copied';
                window.setTimeout(() => { button.textContent = 'Copy'; }, 1000);
            });
        }
        for (const tab of document.querySelectorAll('[data-network-tab]')) {
            tab.addEventListener('click', () => this.selectNetworkTab(tab.dataset.networkTab ?? 'host'));
        }
    }
    showTitle() {
        this.guideOverlay.classList.add('is-hidden');
        this.guidePausedRun = false;
        this.titleScreen.classList.remove('is-hidden');
        this.gameHud.classList.add('is-hidden');
        this.touchControls.classList.add('is-hidden');
        this.lessonOverlay.classList.add('is-hidden');
        this.endOverlay.classList.add('is-hidden');
        this.pauseOverlay.classList.add('is-hidden');
        this.networkOverlay.classList.add('is-hidden');
        this.resetAnnouncements();
        document.body.dataset.mode = 'title';
    }
    showGame() {
        this.titleScreen.classList.add('is-hidden');
        this.gameHud.classList.remove('is-hidden');
        this.touchControls.classList.remove('is-hidden');
        this.endOverlay.classList.add('is-hidden');
        this.pauseOverlay.classList.add('is-hidden');
        this.networkOverlay.classList.add('is-hidden');
        this.guideOverlay.classList.add('is-hidden');
        this.guidePausedRun = false;
        document.body.dataset.mode = 'game';
    }
    /** Update only the small, stable state readouts at the edge of the arena. */
    update(snapshot, localPlayerIndex) {
        const local = snapshot.actors.find((actor) => actor.playerIndex === localPlayerIndex) ??
            snapshot.actors.find((actor) => actor.team === 'players');
        this.updateEncounter(snapshot);
        if (local) {
            this.updatePlayerHud(local, localPlayerIndex);
            this.updateStateCues(local);
            this.announceState(snapshot, local, localPlayerIndex);
            const offered = offeredItem(snapshot, local);
            this.takePrompt.classList.toggle('is-hidden', offered === null);
            if (offered)
                this.takePrompt.textContent = `⇄ ${ITEM_TAKE_LABELS[offered.kind]}`;
            this.switchLabel.textContent = offered ? 'TAKE' : 'SWAP';
            this.switchButton.setAttribute('aria-label', offered ? `Take ${ITEM_TAKE_LABELS[offered.kind].toLowerCase()}` : 'Swap weapon or throw the item in hand');
        }
        else {
            this.takePrompt.classList.add('is-hidden');
            this.switchLabel.textContent = 'SWAP';
        }
    }
    showBanner(title, subtitle = '', durationMs = 600, note = '') {
        window.clearTimeout(this.bannerTimeout);
        this.bannerNote.textContent = note;
        this.bannerTitle.textContent = title;
        this.bannerSubtitle.textContent = subtitle;
        this.banner.classList.remove('is-hidden');
        this.banner.classList.remove('is-leaving');
        this.bannerTimeout = window.setTimeout(() => {
            this.banner.classList.add('is-leaving');
            window.setTimeout(() => this.banner.classList.add('is-hidden'), 180);
        }, durationMs);
    }
    /** Lesson cards teach the exact button routes each new lesson adds. */
    showLesson(ids, interactive) {
        this.lessonCards.replaceChildren();
        this.lessonWaiting.classList.toggle('is-hidden', interactive);
        for (const id of ids) {
            const definition = LESSONS[id];
            const routes = LESSON_ROUTES[id] ?? [];
            const card = document.createElement('button');
            card.className = 'lesson-card';
            card.disabled = !interactive;
            card.innerHTML = `
        <span class="lesson-school">${definition.school}</span>
        <strong>${definition.title}</strong>
        <span>${definition.description}</span>
        <small>${definition.detail}</small>
        <ul class="lesson-routes">${routes.map((route) => `<li>${route}</li>`).join('')}</ul>
      `;
            card.addEventListener('click', () => this.callbacks?.chooseLesson(id));
            this.lessonCards.append(card);
        }
        this.lessonOverlay.classList.remove('is-hidden');
    }
    hideLesson() {
        this.lessonOverlay.classList.add('is-hidden');
    }
    showEnd(victory, copy) {
        this.endTitle.textContent = victory ? 'THE JOURNEY CONTINUES' : 'THE ROAD CLAIMS YOU';
        this.endCopy.textContent = copy;
        this.endOverlay.dataset.outcome = victory ? 'victory' : 'defeat';
        this.endOverlay.classList.remove('is-hidden');
    }
    showPause(paused) {
        this.pauseOverlay.classList.toggle('is-hidden', !paused);
    }
    setTiltStatus(message) {
        this.tiltStatus.textContent = message;
    }
    setNetworkStatus(message) {
        this.networkStatus.textContent = message;
    }
    setPeerConnected(connected) {
        this.hostStart.disabled = !connected;
        this.networkOverlay.classList.toggle('is-connected', connected);
    }
    updateEncounter(snapshot) {
        const waveNumber = snapshot.wavesInLevel > 0 ? snapshot.waveInLevel + 1 : 0;
        this.waveLabel.textContent = snapshot.phase === 'title' ? 'READY' : (snapshot.waveTitle || 'THE ROAD');
        this.waveContext.textContent = snapshot.levelName
            ? `${snapshot.levelName} · ${waveNumber}/${snapshot.wavesInLevel}`
            : 'MEYER’S ROAD';
        const hold = snapshot.phase === 'wave' && snapshot.holdRemaining > 0
            ? `${snapshot.waveLabel} · ${formatClock(snapshot.holdRemaining)}`
            : snapshot.exitOpen ? 'EXIT OPEN · WALK EAST' : '';
        this.waveObjective.textContent = hold;
        this.waveObjective.classList.toggle('is-hidden', hold === '');
        this.wavePrompt.classList.toggle('is-hidden', !snapshot.exitOpen);
    }
    updatePlayerHud(player, localPlayerIndex) {
        const healthRatio = clampRatio(player.health, player.maxHealth);
        const guardRatio = clampRatio(player.guard, player.maxGuard);
        const playerNumber = (player.playerIndex ?? localPlayerIndex) + 1;
        this.playerLabel.textContent = `MEYER · P${playerNumber}`;
        this.playerWeapon.textContent = WEAPON_LABELS[player.weapon];
        this.playerVitals.dataset.state = player.state;
        this.healthFill.style.width = `${healthRatio * 100}%`;
        this.guardFill.style.width = `${guardRatio * 100}%`;
        this.healthValue.textContent = `${Math.max(0, Math.ceil(player.health))}`;
        this.guardValue.textContent = `${Math.max(0, Math.ceil(player.guard))}`;
        this.healthBar.setAttribute('aria-valuenow', String(Math.max(0, Math.round(player.health))));
        this.guardBar.setAttribute('aria-valuenow', String(Math.max(0, Math.round(player.guard))));
    }
    updateStateCues(player) {
        const chained = player.comboCount > 1 ? `${player.comboCount} HIT` : '';
        this.comboCount.textContent = chained;
        this.comboCount.classList.toggle('is-hidden', chained === '');
        const provoked = player.provokeTimer > 0;
        const opening = player.openingTimer > 0;
        this.doctrine.classList.toggle('is-live', provoked || opening);
        requireElement('doctrine-provoke').classList.toggle('is-active', provoked);
        requireElement('doctrine-take').classList.toggle('is-active', opening);
        requireElement('doctrine-hit').classList.toggle('is-active', opening && player.state === 'attack');
        const cue = routeCue(player);
        if (cue !== this.lastRouteCue) {
            this.routeCue.textContent = cue;
            this.lastRouteCue = cue;
        }
    }
    announceState(snapshot, player, localPlayerIndex) {
        const waveKey = `${snapshot.levelIndex}:${snapshot.waveInLevel}:${snapshot.phase}`;
        if (waveKey !== this.lastAnnouncedWave) {
            this.lastAnnouncedWave = waveKey;
            this.announce(`${snapshot.waveTitle || snapshot.phase}. ${snapshot.levelName || 'The road'}.`);
        }
        const weaponKey = `${localPlayerIndex}:${player.weapon}`;
        if (weaponKey !== this.lastAnnouncedWeapon) {
            this.lastAnnouncedWeapon = weaponKey;
            this.announce(`${WEAPON_LABELS[player.weapon]} in hand.`);
        }
    }
    openGuide(pauseRun) {
        if (!this.guideOverlay.classList.contains('is-hidden'))
            return;
        const active = document.activeElement;
        this.guideReturnFocus = active instanceof HTMLElement ? active : null;
        this.guidePausedRun = pauseRun && document.body.dataset.mode === 'game' &&
            this.pauseOverlay.classList.contains('is-hidden');
        if (this.guidePausedRun)
            this.callbacks?.togglePause();
        this.guideOverlay.classList.remove('is-hidden');
        this.guideClose.focus({ preventScroll: true });
    }
    closeGuide() {
        if (this.guideOverlay.classList.contains('is-hidden'))
            return;
        const resume = this.guidePausedRun;
        this.guidePausedRun = false;
        this.guideOverlay.classList.add('is-hidden');
        this.guideReturnFocus?.focus({ preventScroll: true });
        this.guideReturnFocus = null;
        if (resume)
            this.callbacks?.togglePause();
    }
    announce(message) {
        this.uiAnnouncer.textContent = message;
    }
    resetAnnouncements() {
        this.lastAnnouncedWave = '';
        this.lastAnnouncedWeapon = '';
        this.lastRouteCue = '';
        this.uiAnnouncer.textContent = '';
    }
    selectNetworkTab(name) {
        for (const tab of document.querySelectorAll('[data-network-tab]')) {
            tab.classList.toggle('is-active', tab.dataset.networkTab === name);
        }
        for (const panel of document.querySelectorAll('[data-network-panel]')) {
            panel.classList.toggle('is-hidden', panel.dataset.networkPanel !== name);
        }
    }
    async runNetworkAction(action) {
        try {
            await action();
        }
        catch (error) {
            this.setNetworkStatus(error instanceof Error ? error.message : 'Pairing failed.');
        }
    }
}
/** The one thing the road is offering this fighter: the nearest take he has. */
function offeredItem(snapshot, local) {
    if (snapshot.phase !== 'wave' || !ITEM_REACH_STATES.has(local.state))
        return null;
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const item of snapshot.items) {
        if (!itemWithinReach(local, item))
            continue;
        const distance = Math.hypot(item.x - local.x, item.z - local.z);
        if (distance >= bestDistance)
            continue;
        best = item;
        bestDistance = distance;
    }
    return best;
}
function routeCue(player) {
    if (player.state === 'crouch')
        return 'STEP READY · CUT / FINISH';
    if (player.state === 'dodge')
        return 'STEP · DODGE';
    if (player.state === 'block')
        return 'GUARD + DIRECTION → CUT';
    if (player.state === 'hitstun' || player.state === 'guardbreak')
        return 'RECOVER';
    if (player.state === 'attack') {
        const attackId = player.attackId ?? '';
        if (attackId.includes('low'))
            return 'STEP → CUT';
        if (attackId.endsWith('_h') || attackId.includes('finish'))
            return 'FINISH';
        return 'CUT';
    }
    return 'READY · CUT / FINISH';
}
function clampRatio(value, maximum) {
    if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0)
        return 0;
    return Math.min(1, Math.max(0, value / maximum));
}
function requireElement(id) {
    const element = document.getElementById(id);
    if (!element)
        throw new Error(`Missing UI element #${id}`);
    return element;
}
function formatClock(seconds) {
    const whole = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(whole / 60);
    return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}
//# sourceMappingURL=ui.js.map