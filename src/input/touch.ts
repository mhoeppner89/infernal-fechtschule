export type TouchButton = 'light' | 'heavy' | 'mobility' | 'guard' | 'switch';

export class TouchControls {
  readonly enabled: boolean;
  moveX = 0;
  moveZ = 0;

  private readonly held = new Set<TouchButton>();
  // Pointer taps can begin and end between two animation frames on a phone.
  // Latch the down edge until InputHub samples it so short Duck -> Attack
  // sequences are not lost at high refresh rates.
  private readonly pressed = new Set<TouchButton>();
  private joystickPointer: number | null = null;
  private joystickOrigin = { x: 0, y: 0 };
  private readonly joystickZone: HTMLElement | null;
  private readonly joystickKnob: HTMLElement | null;
  private readonly onPressed: (button: TouchButton) => void;

  constructor(root: HTMLElement, onPressed: (button: TouchButton) => void = () => undefined) {
    this.enabled = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.onPressed = onPressed;
    this.joystickZone = root.querySelector<HTMLElement>('[data-control="joystick"]');
    this.joystickKnob = root.querySelector<HTMLElement>('[data-control="joystick-knob"]');
    this.bindJoystick();
    this.bindButtons(root);
  }

  isHeld(button: TouchButton): boolean {
    return this.held.has(button);
  }

  consumePressed(button: TouchButton): boolean {
    return this.pressed.delete(button);
  }

  reset(): void {
    this.held.clear();
    this.pressed.clear();
    this.moveX = 0;
    this.moveZ = 0;
    this.joystickPointer = null;
    this.updateKnob(0, 0);
  }

  private bindButtons(root: HTMLElement): void {
    for (const element of root.querySelectorAll<HTMLElement>('[data-button]')) {
      const button = element.dataset.button as TouchButton | undefined;
      if (!button) continue;
      const press = (event: PointerEvent): void => {
        event.preventDefault();
        element.setPointerCapture?.(event.pointerId);
        if (!this.held.has(button)) {
          this.pressed.add(button);
          this.onPressed(button);
        }
        this.held.add(button);
        element.classList.add('is-held');
      };
      const release = (event: PointerEvent): void => {
        event.preventDefault();
        this.held.delete(button);
        element.classList.remove('is-held');
      };
      element.addEventListener('pointerdown', press);
      element.addEventListener('pointerup', release);
      element.addEventListener('pointercancel', release);
      element.addEventListener('pointerleave', (event) => {
        if ((event as PointerEvent).buttons === 0) release(event as PointerEvent);
      });
      element.addEventListener('contextmenu', (event) => event.preventDefault());
    }
  }

  private bindJoystick(): void {
    const zone = this.joystickZone;
    if (!zone) return;

    zone.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.joystickPointer = event.pointerId;
      const rect = zone.getBoundingClientRect();
      this.joystickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      zone.setPointerCapture?.(event.pointerId);
      this.updateJoystick(event.clientX, event.clientY);
    });

    zone.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.joystickPointer) return;
      event.preventDefault();
      this.updateJoystick(event.clientX, event.clientY);
    });

    const release = (event: PointerEvent): void => {
      if (event.pointerId !== this.joystickPointer) return;
      event.preventDefault();
      this.joystickPointer = null;
      this.moveX = 0;
      this.moveZ = 0;
      this.updateKnob(0, 0);
    };
    zone.addEventListener('pointerup', release);
    zone.addEventListener('pointercancel', release);
    zone.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private updateJoystick(clientX: number, clientY: number): void {
    const radius = 52;
    const dx = clientX - this.joystickOrigin.x;
    const dy = clientY - this.joystickOrigin.y;
    const length = Math.hypot(dx, dy);
    const scale = length > radius ? radius / length : 1;
    const x = dx * scale;
    const y = dy * scale;
    this.moveX = x / radius;
    this.moveZ = y / radius;
    this.updateKnob(x, y);
  }

  private updateKnob(x: number, y: number): void {
    if (this.joystickKnob) this.joystickKnob.style.transform = `translate(${x}px, ${y}px)`;
  }
}
