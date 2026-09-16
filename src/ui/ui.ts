import { LESSONS } from '../sim/lessons.js';
import { LESSON_ROUTES } from '../sim/attacks.js';
import { ITEM_REACH_STATES, itemWithinReach } from '../sim/world.js';
import type { ActorSnapshot, GameSnapshot, ItemKind, ItemSnapshot, LessonId } from '../sim/types.js';

/**
 * What the Switch button means when the road is offering something, spelled out
 * per item: the caret over the thing says there is a take, and this says what
 * the take is, so the button's meaning is declared before it is pressed.
 */
const ITEM_TAKE_LABELS: Readonly<Record<ItemKind, string>> = Object.freeze({
  potion: 'DRINK DRAUGHT',
  club: 'TAKE CUDGEL',
  spear: 'TAKE SHAFT',
  longsword: 'TAKE LONGSWORD',
  dussack: 'TAKE DUSSACK'
});

export interface UiCallbacks {
  startSolo: () => void;
  enableTilt: () => Promise<string>;
  recenterTilt: () => void;
  chooseLesson: (id: LessonId) => void;
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
  private readonly bannerNote = requireElement<HTMLElement>('banner-note');
  private readonly waveObjective = requireElement<HTMLElement>('wave-objective');
  private readonly wavePrompt = requireElement<HTMLElement>('wave-prompt');
  private readonly takePrompt = requireElement<HTMLElement>('take-prompt');
  private readonly doctrine = requireElement<HTMLElement>('doctrine');
  private readonly comboCount = requireElement<HTMLElement>('combo-count');
  private readonly lessonOverlay = requireElement<HTMLElement>('lesson-overlay');
  private readonly lessonCards = requireElement<HTMLElement>('lesson-cards');
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
    this.lessonOverlay.classList.add('is-hidden');
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

  /**
   * The cues the fight itself needs — nothing is read out in a corner. Health,
   * guard, armour, the weapon in hand and the pips left in it are drawn over the
   * fighters; the place and the fight are announced once, by the banner; so what
   * is left here is the handful of things the world cannot say by itself.
   */
  update(snapshot: GameSnapshot, localPlayerIndex: number): void {
    const local = snapshot.actors.find((actor) => actor.playerIndex === localPlayerIndex) ??
      snapshot.actors.find((actor) => actor.team === 'players');
    if (local) this.updateStateCues(local);

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
    if (offered) this.takePrompt.textContent = `⇄ ${ITEM_TAKE_LABELS[offered.kind]}`;
  }

  /**
   * The announcement a wave opens with: where the party is, which fight of that
   * place this is, what the fight is called and what it is asking. It is the only
   * place the journey's place names appear, which is why it lingers long enough
   * to be read (`durationMs`) rather than flashing past like a hit marker.
   */
  showBanner(title: string, subtitle = '', durationMs = 600, note = ''): void {
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
  showLesson(ids: readonly LessonId[], interactive: boolean): void {
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

  hideLesson(): void {
    this.lessonOverlay.classList.add('is-hidden');
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

  /**
   * The two things a fighter's own state says that the world does not: how long
   * the chain he is in has run, and where he stands in the provoke-take-hit
   * moment. Only the second is ever hidden — a chain counter appears with the
   * chain it counts.
   */
  private updateStateCues(player: ActorSnapshot): void {
    const chained = player.comboCount > 1 ? `${player.comboCount} HIT` : '';
    this.comboCount.textContent = chained;
    this.comboCount.classList.toggle('is-hidden', chained === '');

    // The doctrine line is state, not chrome: it is on screen only while a
    // provoke or an opening is live, and invisible the rest of the time.
    const provoked = player.provokeTimer > 0;
    const opening = player.openingTimer > 0;
    this.doctrine.classList.toggle('is-live', provoked || opening);
    requireElement<HTMLElement>('doctrine-provoke').classList.toggle('is-active', provoked);
    requireElement<HTMLElement>('doctrine-take').classList.toggle('is-active', opening);
    requireElement<HTMLElement>('doctrine-hit').classList.toggle('is-active', opening && player.state === 'attack');
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

/** The one thing the road is offering this fighter: the nearest take he has. */
function offeredItem(snapshot: GameSnapshot, local: ActorSnapshot): ItemSnapshot | null {
  if (snapshot.phase !== 'wave' || !ITEM_REACH_STATES.has(local.state)) return null;
  let best: ItemSnapshot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of snapshot.items) {
    if (!itemWithinReach(local, item)) continue;
    const distance = Math.hypot(item.x - local.x, item.z - local.z);
    if (distance >= bestDistance) continue;
    best = item;
    bestDistance = distance;
  }
  return best;
}

function requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing UI element #${id}`);
  return element as T;
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

