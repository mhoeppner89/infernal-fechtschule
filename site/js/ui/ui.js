import { getUpgrade } from '../sim/upgrades.js';
export class GameUI {
    titleScreen = requireElement('title-screen');
    gameHud = requireElement('game-hud');
    touchControls = requireElement('touch-controls');
    banner = requireElement('banner');
    bannerTitle = requireElement('banner-title');
    bannerSubtitle = requireElement('banner-subtitle');
    upgradeOverlay = requireElement('upgrade-overlay');
    upgradeCards = requireElement('upgrade-cards');
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
        this.upgradeOverlay.classList.add('is-hidden');
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
    update(snapshot, localPlayerIndex) {
        const local = snapshot.actors.find((actor) => actor.playerIndex === localPlayerIndex) ??
            snapshot.actors.find((actor) => actor.team === 'players');
        if (local)
            this.updatePlayerHud(local);
        setText('wave-label', snapshot.waveIndex >= 0 ? `WAVE ${snapshot.waveIndex + 1}` : 'PREPARE');
        setText('wave-title', snapshot.waveTitle);
        setText('score-value', snapshot.score.toLocaleString());
        const boss = snapshot.actors.find((actor) => actor.archetype === 'grotesque');
        const bossHud = requireElement('boss-hud');
        if (boss && boss.state !== 'dead') {
            bossHud.classList.remove('is-hidden');
            setBar('boss-health-fill', boss.health / boss.maxHealth);
            setText('boss-name', boss.name);
        }
        else {
            bossHud.classList.add('is-hidden');
        }
    }
    showBanner(title, subtitle = '') {
        window.clearTimeout(this.bannerTimeout);
        this.bannerTitle.textContent = title;
        this.bannerSubtitle.textContent = subtitle;
        this.banner.classList.remove('is-hidden');
        this.banner.classList.remove('is-leaving');
        this.bannerTimeout = window.setTimeout(() => {
            this.banner.classList.add('is-leaving');
            window.setTimeout(() => this.banner.classList.add('is-hidden'), 360);
        }, 2100);
    }
    showUpgrade(ids, interactive) {
        this.upgradeCards.replaceChildren();
        this.lessonWaiting.classList.toggle('is-hidden', interactive);
        for (const id of ids) {
            const definition = getUpgrade(id);
            const card = document.createElement('button');
            card.className = 'lesson-card';
            card.disabled = !interactive;
            card.innerHTML = `
        <span class="lesson-school">${definition.school}</span>
        <strong>${definition.title}</strong>
        <span>${definition.description}</span>
        <small>${definition.detail}</small>
      `;
            card.addEventListener('click', () => this.callbacks?.chooseUpgrade(id));
            this.upgradeCards.append(card);
        }
        this.upgradeOverlay.classList.remove('is-hidden');
    }
    hideUpgrade() {
        this.upgradeOverlay.classList.add('is-hidden');
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
    updatePlayerHud(player) {
        setText('player-name', player.name);
        setText('weapon-name', player.weapon === 'longsword' ? 'LONGSWORD' : 'DUSSACK');
        setBar('health-fill', player.health / player.maxHealth);
        setBar('guard-fill', player.maxGuard > 0 ? player.guard / player.maxGuard : 0);
        setText('health-number', `${Math.ceil(player.health)} / ${player.maxHealth}`);
        setText('guard-number', `${Math.ceil(player.guard)} / ${player.maxGuard}`);
        setText('combo-count', player.comboCount > 1 ? `${player.comboCount} HIT` : '');
        const provoke = requireElement('doctrine-provoke');
        const take = requireElement('doctrine-take');
        const hit = requireElement('doctrine-hit');
        provoke.classList.toggle('is-active', player.provokeTimer > 0);
        take.classList.toggle('is-active', player.openingTimer > 0);
        hit.classList.toggle('is-active', player.openingTimer > 0 && player.state === 'attack');
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
function requireElement(id) {
    const element = document.getElementById(id);
    if (!element)
        throw new Error(`Missing UI element #${id}`);
    return element;
}
function setText(id, text) {
    requireElement(id).textContent = text;
}
function setBar(id, value) {
    requireElement(id).style.setProperty('--bar-value', `${Math.max(0, Math.min(1, value)) * 100}%`);
}
//# sourceMappingURL=ui.js.map