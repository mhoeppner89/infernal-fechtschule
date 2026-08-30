import { clamp, damp } from '../sim/math.js';

interface OrientationSample {
  beta: number;
  gamma: number;
}

type PermissionCapableOrientation = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

export class TiltController {
  enabled = false;
  calibrated = false;
  sensitivity = 1;
  invertDepth = false;

  private raw: OrientationSample = { beta: 0, gamma: 0 };
  private baseline: OrientationSample = { beta: 0, gamma: 0 };
  private outputX = 0;
  private outputZ = 0;
  private listening = false;

  async requestPermissionAndEnable(): Promise<string> {
    if (!('DeviceOrientationEvent' in window)) {
      throw new Error('This browser does not expose device-orientation input.');
    }

    const Orientation = DeviceOrientationEvent as PermissionCapableOrientation;
    if (typeof Orientation.requestPermission === 'function') {
      const permission = await Orientation.requestPermission();
      if (permission !== 'granted') throw new Error('Motion permission was denied.');
    }

    this.startListening();
    this.enabled = true;
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    this.recenter();
    return 'Tilt enabled and centred.';
  }

  disable(): void {
    this.enabled = false;
    this.outputX = 0;
    this.outputZ = 0;
  }

  recenter(): void {
    this.baseline = { ...this.raw };
    this.calibrated = true;
  }

  sample(dt: number): { x: number; z: number } {
    if (!this.enabled || !this.calibrated) return { x: 0, z: 0 };

    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    const betaDelta = this.raw.beta - this.baseline.beta;
    const gammaDelta = this.raw.gamma - this.baseline.gamma;

    let lateral: number;
    let depth: number;
    if (angle === 90) {
      lateral = betaDelta;
      depth = -gammaDelta;
    } else if (angle === 270 || angle === -90) {
      lateral = -betaDelta;
      depth = gammaDelta;
    } else {
      lateral = gammaDelta;
      depth = betaDelta;
    }

    const mapAxis = (degrees: number): number => {
      const sign = Math.sign(degrees);
      const magnitude = Math.abs(degrees);
      const deadZone = 3.5;
      const fullTilt = 17;
      if (magnitude <= deadZone) return 0;
      const normalized = clamp((magnitude - deadZone) / (fullTilt - deadZone), 0, 1);
      return sign * normalized * normalized * (3 - 2 * normalized) * this.sensitivity;
    };

    const targetX = clamp(mapAxis(lateral), -1, 1);
    const targetZ = clamp(mapAxis(depth) * (this.invertDepth ? -1 : 1), -1, 1);
    this.outputX = damp(this.outputX, targetX, 13, dt);
    this.outputZ = damp(this.outputZ, targetZ, 13, dt);
    return { x: this.outputX, z: this.outputZ };
  }

  private startListening(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('deviceorientation', (event) => {
      if (event.beta === null || event.gamma === null) return;
      this.raw.beta = event.beta;
      this.raw.gamma = event.gamma;
    }, { passive: true });
  }
}
