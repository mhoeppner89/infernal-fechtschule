import { clamp, damp } from '../sim/math.js';
export class TiltController {
    enabled = false;
    calibrated = false;
    sensitivity = 1;
    invertDepth = false;
    raw = { beta: 0, gamma: 0 };
    baseline = { beta: 0, gamma: 0 };
    outputX = 0;
    outputZ = 0;
    listening = false;
    async requestPermissionAndEnable() {
        if (!('DeviceOrientationEvent' in window)) {
            throw new Error('This browser does not expose device-orientation input.');
        }
        const Orientation = DeviceOrientationEvent;
        if (typeof Orientation.requestPermission === 'function') {
            const permission = await Orientation.requestPermission();
            if (permission !== 'granted')
                throw new Error('Motion permission was denied.');
        }
        this.startListening();
        this.enabled = true;
        await new Promise((resolve) => window.setTimeout(resolve, 350));
        this.recenter();
        return 'Tilt enabled and centred.';
    }
    disable() {
        this.enabled = false;
        this.outputX = 0;
        this.outputZ = 0;
    }
    recenter() {
        this.baseline = { ...this.raw };
        this.calibrated = true;
    }
    sample(dt) {
        if (!this.enabled || !this.calibrated)
            return { x: 0, z: 0 };
        const angle = screen.orientation?.angle ?? window.orientation ?? 0;
        const betaDelta = this.raw.beta - this.baseline.beta;
        const gammaDelta = this.raw.gamma - this.baseline.gamma;
        let lateral;
        let depth;
        if (angle === 90) {
            lateral = betaDelta;
            depth = -gammaDelta;
        }
        else if (angle === 270 || angle === -90) {
            lateral = -betaDelta;
            depth = gammaDelta;
        }
        else {
            lateral = gammaDelta;
            depth = betaDelta;
        }
        const mapAxis = (degrees) => {
            const sign = Math.sign(degrees);
            const magnitude = Math.abs(degrees);
            const deadZone = 3.5;
            const fullTilt = 17;
            if (magnitude <= deadZone)
                return 0;
            const normalized = clamp((magnitude - deadZone) / (fullTilt - deadZone), 0, 1);
            return sign * normalized * normalized * (3 - 2 * normalized) * this.sensitivity;
        };
        const targetX = clamp(mapAxis(lateral), -1, 1);
        const targetZ = clamp(mapAxis(depth) * (this.invertDepth ? -1 : 1), -1, 1);
        this.outputX = damp(this.outputX, targetX, 13, dt);
        this.outputZ = damp(this.outputZ, targetZ, 13, dt);
        return { x: this.outputX, z: this.outputZ };
    }
    startListening() {
        if (this.listening)
            return;
        this.listening = true;
        window.addEventListener('deviceorientation', (event) => {
            if (event.beta === null || event.gamma === null)
                return;
            this.raw.beta = event.beta;
            this.raw.gamma = event.gamma;
        }, { passive: true });
    }
}
//# sourceMappingURL=tilt.js.map