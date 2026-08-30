import { getUpgrade } from '../sim/upgrades.js';
import type { ActorSnapshot, GameSnapshot, UpgradeId } from '../sim/types.js';

export interface UiCallbacks {
  startSolo: () => void;
  enableTilt: () => Promise<string>;
  recenterTilt: () => void;
  chooseUpgrade: (id: UpgradeId) => void;
  restart: () => void;
  returnToTitle: () => void;
  togglePause: () => void;
  generateHostOffer: () => Promise<string>;
  applyHostAnswer: (token: string) => Promise<void>;
  createGuestAnswer: (token: string) => Promise<string>;
  startHostRun: () => void;
}

export class GameUI {
  private readonly titleScreen = requireElement<HTMLElement>('title-screen');
  private readonly gameHud = requireElement<HTMLElement>('game-hud');
  private readonly touchControls = requireElement<HTMLElement>('touch-controls');
  private readonly banner = requireElement<HTMLElement>('banner');
  private readonly bannerTitle = requireElement<HTMLElement>('banner-title');
  private readonly bannerSubtitle = requireElement<HTMLElement>('banner-subtitle');
  private readonly upgradeOverlay = requireElement<HTMLElement>('upgrade-overlay');
  private readonly upgradeCards = requireElement<HTMLElement>('upgrade-cards');
  private readonly endOverlay = requireElement<HTMLElement>('end-overlay');
  private readonly endTitle = requireElement<HTMLElement>('end-title');
  private readonly endCopy = requireElement<HTMLElement>('end-copy');
  private readonly pauseOverlay = requireElement<HTMLElement>('pause-overlay');
  private readonly networkOverlay = requireElement<HTMLElement>('network-overlay');
  private readonly networkStatus = requireElement<HTMLElement>('network-status');
  private readonly hostOffer = requireElement<HTMLTextAreaElement>('host-offer');
  private readonly hostAnswer = requireElement<HTMLTextAreaElement>('host-answer');
  private readonly guestOffer = requireElement<HTMLTextAreaElement>('guest-offer');
  private readonly guestAnswer = requireElement<HTMLTextAreaElement>('guest-answer');
  private readonly hostStart = requireElement<HTMLButtonElement>('host-start');
  private readonly tiltStatus = requireElement<HTMLElement>('tilt-status');
  private readonly lessonWaiting = requireElement<HTMLElement>('lesson-waiting');

  private callbacks: UiCallbacks | null = null;
  private bannerTimeout = 0;

  bind(callbacks: UiCallbacks): void {
    this.callbacks = callbacks;
    requireElement('start-solo').addEventListener('click', () => callbacks.startSolo());
    requireElement('open-network').addEventListener('click', () => this.networkOverlay.classList.remove('is-hidden'));
    requireElement('close-network').addEventListener('click', () => this.networkOverlay.classList.add('is-hidden'));
    requireElement('enable-tilt').addEventListener('click', async () => {
      try {
        this.setTiltStatus('Requesting motion permission…');
        this.setTiltStatus(await callbacks.enableTilt());
      } catch (error) {
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

    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy-target]')) {
      button.addEventListener('click', async () => {
        const targetId = button.dataset.copyTarget;
        const target = targetId ? document.getElementById(targetId) as HTMLTextAreaElement | null : null;
        if (!target?.value) return;
        await navigator.clipboard.writeText(target.value);
        button.textContent = 'Copied';
        window.setTimeout(() => { button.textContent = 'Copy'; }, 1000);
      });
    }

    for (const tab of document.querySelectorAll<HTMLButtonElement>('[data-network-tab]')) {
      tab.addEventListener('click', () => this.selectNetworkTab(tab.dataset.networkTab ?? 'host'));
    }
  }

  showTitle(): void {
    this.titleScreen.classList.remove('is-hidden');
    this.gameHud.classList.add('is-hidden');
    this.touchControls.classList.add('is-hidden');
    this.upgradeOverlay.classList.add('is-hidden');
    this.endOverlay.classList.add('is-hidden');
    this.pauseOverlay.classList.add('is-hidden');
    this.networkOverlay.classList.add('is-hidden');
    document.body.dataset.mode = 'title';
  }

  showGame(): void {
    this.titleScreen.classList.add('is-hidden');
    this.gameHud.classList.remove('is-hidden');
    this.touchControls.classList.remove('is-hidden');
    this.endOverlay.classList.add('is-hidden');
    this.pauseOverlay.classList.add('is-hidden');
    this.networkOverlay.classList.add('is-hidden');
    document.body.dataset.mode = 'game';
  }

  update(snapshot: GameSnapshot, localPlayerIndex: number): void {
    const local = snapshot.actors.find((actor) => actor.playerIndex === localPlayerIndex) ??
      snapshot.actors.find((actor) => actor.team === 'players');
    if (local) this.updatePlayerHud(local);

    setText('wave-label', snapshot.waveIndex >= 0 ? `WAVE ${snapshot.waveIndex + 1}` : 'PREPARE');
    setText('wave-title', snapshot.waveTitle);
    setText('score-value', snapshot.score.toLocaleString());

    const boss = snapshot.actors.find((actor) => actor.archetype === 'grotesque');
    const bossHud = requireElement<HTMLElement>('boss-hud');
    if (boss && boss.state !== 'dead') {
      bossHud.classList.remove('is-hidden');
      setBar('boss-health-fill', boss.health / boss.maxHealth);
      setText('boss-name', boss.name);
    } else {
      bossHud.classList.add('is-hidden');
    }
  }

  showBanner(title: string, subtitle = ''): void {
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

  showUpgrade(ids: readonly UpgradeId[], interactive: boolean): void {
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

  hideUpgrade(): void {
    this.upgradeOverlay.classList.add('is-hidden');
  }

  showEnd(victory: boolean, copy: string): void {
    this.endTitle.textContent = victory ? 'THE JOURNEY CONTINUES' : 'THE ROAD CLAIMS YOU';
    this.endCopy.textContent = copy;
    this.endOverlay.dataset.outcome = victory ? 'victory' : 'defeat';
    this.endOverlay.classList.remove('is-hidden');
  }

  showPause(paused: boolean): void {
    this.pauseOverlay.classList.toggle('is-hidden', !paused);
  }

  setTiltStatus(message: string): void {
    this.tiltStatus.textContent = message;
  }

  setNetworkStatus(message: string): void {
    this.networkStatus.textContent = message;
  }

  setPeerConnected(connected: boolean): void {
    this.hostStart.disabled = !connected;
    this.networkOverlay.classList.toggle('is-connected', connected);
  }

  private updatePlayerHud(player: ActorSnapshot): void {
    setText('player-name', player.name);
    setText('weapon-name', player.weapon === 'longsword' ? 'LONGSWORD' : 'DUSSACK');
    setBar('health-fill', player.health / player.maxHealth);
    setBar('guard-fill', player.maxGuard > 0 ? player.guard / player.maxGuard : 0);
    setText('health-number', `${Math.ceil(player.health)} / ${player.maxHealth}`);
    setText('guard-number', `${Math.ceil(player.guard)} / ${player.maxGuard}`);
    setText('combo-count', player.comboCount > 1 ? `${player.comboCount} HIT` : '');

    const provoke = requireElement<HTMLElement>('doctrine-provoke');
    const take = requireElement<HTMLElement>('doctrine-take');
    const hit = requireElement<HTMLElement>('doctrine-hit');
    provoke.classList.toggle('is-active', player.provokeTimer > 0);
    take.classList.toggle('is-active', player.openingTimer > 0);
    hit.classList.toggle('is-active', player.openingTimer > 0 && player.state === 'attack');
  }

  private selectNetworkTab(name: string): void {
    for (const tab of document.querySelectorAll<HTMLElement>('[data-network-tab]')) {
      tab.classList.toggle('is-active', tab.dataset.networkTab === name);
    }
    for (const panel of document.querySelectorAll<HTMLElement>('[data-network-panel]')) {
      panel.classList.toggle('is-hidden', panel.dataset.networkPanel !== name);
    }
  }

  private async runNetworkAction(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.setNetworkStatus(error instanceof Error ? error.message : 'Pairing failed.');
    }
  }
}

function requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element #${id}`);
  return element as T;
}

function setText(id: string, text: string): void {
  requireElement(id).textContent = text;
}

function setBar(id: string, value: number): void {
  requireElement<HTMLElement>(id).style.setProperty('--bar-value', `${Math.max(0, Math.min(1, value)) * 100}%`);
}
