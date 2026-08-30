import { TouchControls } from './touch.js';
import { TiltController } from './tilt.js';
const BUTTON_KEYS = Object.freeze({
    light: Object.freeze(['KeyJ', 'KeyZ']),
    heavy: Object.freeze(['KeyK', 'KeyX']),
    mobility: Object.freeze(['KeyL', 'KeyC']),
    guard: Object.freeze(['KeyI', 'KeyV', 'ShiftLeft', 'ShiftRight']),
    switch: Object.freeze(['KeyU', 'Space'])
});
export class InputHub {
    tilt = new TiltController();
    touch;
    keys = new Set();
    previousHeld = new Map();
    constructor(controlRoot) {
        this.touch = new TouchControls(controlRoot);
        window.addEventListener('keydown', (event) => {
            if (event.repeat && event.code !== 'ArrowLeft' && event.code !== 'ArrowRight')
                return;
            this.keys.add(event.code);
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code))
                event.preventDefault();
        });
        window.addEventListener('keyup', (event) => this.keys.delete(event.code));
        window.addEventListener('blur', () => this.reset());
    }
    sample(dt) {
        const keyboardX = (this.down('ArrowRight', 'KeyD') ? 1 : 0) - (this.down('ArrowLeft', 'KeyA') ? 1 : 0);
        const keyboardZ = (this.down('ArrowDown', 'KeyS') ? 1 : 0) - (this.down('ArrowUp', 'KeyW') ? 1 : 0);
        const tilt = this.tilt.sample(dt);
        let moveX = this.touch.moveX;
        let moveZ = this.touch.moveZ;
        if (this.tilt.enabled && Math.hypot(tilt.x, tilt.z) > 0.03) {
            moveX = tilt.x;
            moveZ = tilt.z;
        }
        if (Math.hypot(keyboardX, keyboardZ) > 0) {
            moveX = keyboardX;
            moveZ = keyboardZ;
        }
        const held = new Map();
        for (const button of Object.keys(BUTTON_KEYS)) {
            held.set(button, this.touch.isHeld(button) || BUTTON_KEYS[button].some((code) => this.keys.has(code)));
        }
        const pressed = (button) => {
            const now = held.get(button) ?? false;
            const before = this.previousHeld.get(button) ?? false;
            return now && !before;
        };
        const frame = {
            moveX,
            moveZ,
            lightPressed: pressed('light'),
            heavyPressed: pressed('heavy'),
            mobilityPressed: pressed('mobility'),
            switchPressed: pressed('switch'),
            guardHeld: held.get('guard') ?? false,
            guardPressed: pressed('guard')
        };
        this.previousHeld = held;
        return frame;
    }
    reset() {
        this.keys.clear();
        this.previousHeld.clear();
        this.touch.reset();
    }
    static withoutEdges(frame) {
        return {
            ...frame,
            lightPressed: false,
            heavyPressed: false,
            mobilityPressed: false,
            switchPressed: false,
            guardPressed: false
        };
    }
    down(...codes) {
        return codes.some((code) => this.keys.has(code));
    }
}
//# sourceMappingURL=input.js.map