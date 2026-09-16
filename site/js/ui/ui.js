import { LESSONS } from '../sim/lessons.js';
import { LESSON_ROUTES } from '../sim/attacks.js';
import { ITEM_REACH_STATES, itemWithinReach } from '../sim/world.js';
/**
 * What the Switch button means when the road is offering something, spelled out
 * per item: the caret over the thing says there is a take, and this says what
 * the take is, so the button's meaning is declared before it is pressed.
 */
const ITEM_TAKE_LABELS = Object.freeze({
    potion: 'DRINK DRAUGHT',
    club: 'TAKE CUDGEL',
    spear: 'TAKE SHAFT',
    longsword: 'TAKE LONGSWORD',
    dussack: 'TAKE DUSSACK'
});
export class GameUI {
    titleScreen = requireElement('title-screen');
    gameHud = requireElement('game-hud');
    touchControls = requireElement('touch-controls');
    banner = requireElement('banner');
    bannerTitle = requireElement('banner-title');
    bannerSubtitle = requireElement('banner-subtitle');
    bannerNote = requireElement('banner-note');
    waveObjective = requireElement('wave-objective');
    wavePrompt = requireElement('wave-prompt');
    takePrompt = requireElement('take-prompt');
    doctrine = requireElement('doctrine');
    comboCount = requireElement('combo-count');
    lessonOverlay = requireElement('lesson-overlay');
    lessonCards = requireElement('lesson-cards');
    endOverlay = requireElement('end-overlay');
    endTitle = requireElement('end-title');
    endCopy = requireElement('end-copy');
    pauseOverlay = requireElement('pause-overlay');
    networkOverlay = requireElement('network-overlay');
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
    bind(callbacks) {
        this.callbacks = callbacks;
        requireElement('start-solo').addEventListener('click', () => callbacks.startSolo());
        requireElement('open-network').addEventListener('click', () => this.networkOverlay.classList.remove('is-hidden'));
        requireElement('close-network').addEventListener('click', () => this.networkOverlay.classList.add('is-hidden'));
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
        this.titleScreen.classList.remove('is-hidden');
        this.gameHud.classList.add('is-hidden');
        this.touchControls.classList.add('is-hidden');
        this.lessonOverlay.classList.add('is-hidden');
        this.endOverlay.classList.add('is-hidden');
        this.pauseOverlay.classList.add('is-hidden');
        this.networkOverlay.classList.add('is-hidden');
        document.body.dataset.mode = 'title';
    }
    showGame() {
        this.titleScreen.classList.add('is-hidden');
        this.gameHud.classList.remove('is-hidden');
        this.touchControls.classList.remove('is-hidden');
        this.endOverlay.classList.add('is-hidden');
        this.pauseOverlay.classList.add('is-hidden');
        this.networkOverlay.classList.add('is-hidden');
        document.body.dataset.mode = 'game';
    }
    /**
     * The cues the fight itself needs — nothing is read out in a corner. Health,
     * guard, armour, the weapon in hand and the pips left in it are drawn over the
     * fighters; the place and the fight are announced once, by the banner; so what
     * is left here is the handful of things the world cannot say by itself.
     */
    update(snapshot, localPlayerIndex) {
        const local = snapshot.actors.find((actor) => actor.playerIndex === localPlayerIndex) ??
            snapshot.actors.find((actor) => actor.team === 'players');
        if (local)
            this.updateStateCues(local);
        // The one objective that cannot be read off the world: a stand is a clock, so
        // it says so — and nothing else does, because the road already says it. The
        // clock is the whole test: only a stand runs one, and it runs while the
        // encounter is still owed.
        const hold = snapshot.phase === 'wave' && snapshot.holdRemaining > 0
            ? `${snapshot.waveLabel} · ${formatClock(snapshot.holdRemaining)}`
            : '';
        this.waveObjective.textContent = hold;
        this.waveObjective.classList.toggle('is-hidden', hold === '');
        // A cleared level stays cleared until the player walks out of it, so the cue
        // stands for as long as the doorway is open.
        this.wavePrompt.classList.toggle('is-hidden', !snapshot.exitOpen);
        // And when the road offers a take, the cue names it for as long as the offer
        // stands — the same predicate the press is decided by.
        const offered = local ? offeredItem(snapshot, local) : null;
        this.takePrompt.classList.toggle('is-hidden', offered === null);
        if (offered)
            this.takePrompt.textContent = `⇄ ${ITEM_TAKE_LABELS[offered.kind]}`;
    }
    /**
     * The announcement a wave opens with: where the party is, which fight of that
     * place this is, what the fight is called and what it is asking. It is the only
     * place the journey's place names appear, which is why it lingers long enough
     * to be read (`durationMs`) rather than flashing past like a hit marker.
     */
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
    /** Lesson cards teach the exact button routes each unlock adds. */
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
    /**
     * The two things a fighter's own state says that the world does not: how long
     * the chain he is in has run, and where he stands in the provoke-take-hit
     * moment. Only the second is ever hidden — a chain counter appears with the
     * chain it counts.
     */
    updateStateCues(player) {
        const chained = player.comboCount > 1 ? `${player.comboCount} HIT` : '';
        this.comboCount.textContent = chained;
        this.comboCount.classList.toggle('is-hidden', chained === '');
        // The doctrine line is state, not chrome: it is on screen only while a
        // provoke or an opening is live, and invisible the rest of the time.
        const provoked = player.provokeTimer > 0;
        const opening = player.openingTimer > 0;
        this.doctrine.classList.toggle('is-live', provoked || opening);
        requireElement('doctrine-provoke').classList.toggle('is-active', provoked);
        requireElement('doctrine-take').classList.toggle('is-active', opening);
        requireElement('doctrine-hit').classList.toggle('is-active', opening && player.state === 'attack');
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