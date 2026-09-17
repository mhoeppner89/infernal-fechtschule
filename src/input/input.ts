import type { InputFrame } from '../sim/types.js';
import { NEUTRAL_INPUT } from '../sim/types.js';
import { TouchControls, type TouchButton } from './touch.js';
import { TiltController } from './tilt.js';

const BUTTON_KEYS: Readonly<Record<TouchButton, readonly string[]>> = Object.freeze({
  light: Object.freeze(['KeyJ', 'KeyZ']),
  heavy: Object.freeze(['KeyK', 'KeyX']),
  mobility: Object.freeze(['KeyL', 'KeyC']),
  guard: Object.freeze(['KeyI', 'KeyV', 'ShiftLeft', 'ShiftRight']),
  switch: Object.freeze(['KeyU', 'Space'])
});

const MOVEMENT_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);

export class InputHub {
  readonly tilt = new TiltController();
  readonly touch: TouchControls;

  private readonly keys = new Set<string>();
  private readonly pressedOrder: TouchButton[] = [];
  private previousHeld = new Map<TouchButton, boolean>();

  constructor(controlRoot: HTMLElement) {
    this.touch = new TouchControls(
      controlRoot,
      (button) => this.recordPress(button),
      () => this.isGameplayInputBlocked()
    );
    window.addEventListener('keydown', (event) => {
      // A focused form control, title button, or open overlay owns the key.
      // This keeps Space from being turned into SWAP while activating Start,
      // and keeps pairing textareas usable on touch keyboards.
      if (this.isGameplayInputBlocked()) {
        this.keys.delete(event.code);
        return;
      }
      const focused = typeof document === 'undefined' ? null : document.activeElement;
      if (event.code === 'Space' && typeof HTMLElement !== 'undefined' && focused instanceof HTMLElement && focused.matches('button, summary') && !focused.closest('#touch-controls')) return;
      if (event.repeat && !MOVEMENT_KEYS.has(event.code)) return;
      const wasDown = this.keys.has(event.code);
      this.keys.add(event.code);
      if (!wasDown) {
        for (const button of Object.keys(BUTTON_KEYS) as TouchButton[]) {
          if (BUTTON_KEYS[button].includes(event.code)) this.recordPress(button);
        }
      }
      if (MOVEMENT_KEYS.has(event.code) || event.code === 'Space') event.preventDefault();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.reset());
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.reset();
      });
    }
    window.addEventListener('orientationchange', () => this.reset());
  }

  sample(dt: number): InputFrame {
    if (this.isGameplayInputBlocked()) {
      this.reset();
      return { ...NEUTRAL_INPUT };
    }

    const keyboardX = (this.down('ArrowRight', 'KeyD') ? 1 : 0) - (this.down('ArrowLeft', 'KeyA') ? 1 : 0);
    const keyboardZ = (this.down('ArrowDown', 'KeyS') ? 1 : 0) - (this.down('ArrowUp', 'KeyW') ? 1 : 0);
    const tilt = this.tilt.sample(dt);

    let moveX = this.touch.moveX;
    let moveZ = this.touch.moveZ;
    if (this.tilt.enabled && !this.touch.hasMovementPointer && Math.hypot(tilt.x, tilt.z) > 0.03) {
      moveX = tilt.x;
      moveZ = tilt.z;
    }
    if (Math.hypot(keyboardX, keyboardZ) > 0) {
      moveX = keyboardX;
      moveZ = keyboardZ;
    }

    const held = new Map<TouchButton, boolean>();
    for (const button of Object.keys(BUTTON_KEYS) as TouchButton[]) {
      held.set(button, this.touch.isHeld(button) || BUTTON_KEYS[button].some((code) => this.keys.has(code)));
    }

    const orderedPresses = this.pressedOrder.splice(0, this.pressedOrder.length);
    for (const button of Object.keys(BUTTON_KEYS) as TouchButton[]) {
      const now = held.get(button) ?? false;
      const before = this.previousHeld.get(button) ?? false;
      const touchLatched = this.touch.consumePressed(button);
      if ((touchLatched || (now && !before)) && !orderedPresses.includes(button)) {
        orderedPresses.push(button);
      }
    }

    const pressed = new Set(orderedPresses);
    const mobilityIndex = orderedPresses.indexOf('mobility');
    const lightIndex = orderedPresses.indexOf('light');
    const heavyIndex = orderedPresses.indexOf('heavy');
    const firstAttackIndex = [lightIndex, heavyIndex]
      .filter((index) => index >= 0)
      .reduce((first, index) => Math.min(first, index), Number.POSITIVE_INFINITY);
    // A single sampled frame can contain several physical edges. STEP only
    // modifies an attack when its edge happened first; Attack -> STEP remains a
    // standing attack even on 90/120 Hz displays. The physical order is kept in
    // pressedOrder, so keyboard and touch follow the same route semantics.
    if (firstAttackIndex < mobilityIndex) pressed.delete('mobility');

    const frame: InputFrame = {
      moveX,
      moveZ,
      lightPressed: pressed.has('light'),
      heavyPressed: pressed.has('heavy'),
      mobilityPressed: pressed.has('mobility'),
      switchPressed: pressed.has('switch'),
      guardHeld: held.get('guard') ?? false,
      guardPressed: pressed.has('guard')
    };
    this.previousHeld = held;
    return frame;
  }

  reset(): void {
    this.keys.clear();
    this.pressedOrder.length = 0;
    this.previousHeld.clear();
    this.touch.reset();
  }

  static withoutEdges(frame: InputFrame): InputFrame {
    return {
      ...frame,
      lightPressed: false,
      heavyPressed: false,
      mobilityPressed: false,
      switchPressed: false,
      guardPressed: false
    };
  }

  private down(...codes: string[]): boolean {
    return codes.some((code) => this.keys.has(code));
  }

  private recordPress(button: TouchButton): void {
    if (this.isGameplayInputBlocked()) return;
    if (!this.pressedOrder.includes(button)) this.pressedOrder.push(button);
  }

  private isGameplayInputBlocked(): boolean {
    if (typeof document === 'undefined') return false;
    if (document.body?.dataset.mode === 'title') return true;
    if (document.querySelector('.modal-overlay:not(.is-hidden)')) return true;

    const active = document.activeElement;
    if (typeof HTMLElement === 'undefined' || !(active instanceof HTMLElement)) return false;
    // Shell button focus must not strand touch controls after a guide closes.
    // Space keeps its native button activation behavior in the key handler.
    if (active.closest('#touch-controls')) return false;
    // A title button can remain the active element for one frame after Play
    // hides the title. It no longer owns input once its panel is hidden.
    const title = active.closest('#title-screen');
    if (title?.classList.contains('is-hidden')) return false;
    const hiddenOverlay = active.closest('.modal-overlay');
    if (hiddenOverlay?.classList.contains('is-hidden')) return false;
    return active.matches('input, textarea, select, [contenteditable="true"]');
  }
}
