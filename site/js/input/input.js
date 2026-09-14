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
    pressedOrder = [];
    previousHeld = new Map();
    constructor(controlRoot) {
        this.touch = new TouchControls(controlRoot, (button) => this.recordPress(button));
        window.addEventListener('keydown', (event) => {
            if (event.repeat && event.code !== 'ArrowLeft' && event.code !== 'ArrowRight')
                return;
            const wasDown = this.keys.has(event.code);
            this.keys.add(event.code);
            if (!wasDown) {
                for (const button of Object.keys(BUTTON_KEYS)) {
                    if (BUTTON_KEYS[button].includes(event.code))
                        this.recordPress(button);
                }
            }
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
        const orderedPresses = this.pressedOrder.splice(0, this.pressedOrder.length);
        for (const button of Object.keys(BUTTON_KEYS)) {
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
        // A single sampled frame can contain several physical edges. Duck only
        // modifies an attack when its edge happened first; Attack -> Duck remains a
        // standing attack even on 90/120 Hz displays.
        if (firstAttackIndex < mobilityIndex)
            pressed.delete('mobility');
        const frame = {
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
    reset() {
        this.keys.clear();
        this.pressedOrder.length = 0;
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
    recordPress(button) {
        if (!this.pressedOrder.includes(button))
            this.pressedOrder.push(button);
    }
}
//# sourceMappingURL=input.js.map