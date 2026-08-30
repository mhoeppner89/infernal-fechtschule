export class TouchControls {
    enabled;
    moveX = 0;
    moveZ = 0;
    held = new Set();
    joystickPointer = null;
    joystickOrigin = { x: 0, y: 0 };
    joystickZone;
    joystickKnob;
    constructor(root) {
        this.enabled = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
        this.joystickZone = root.querySelector('[data-control="joystick"]');
        this.joystickKnob = root.querySelector('[data-control="joystick-knob"]');
        this.bindJoystick();
        this.bindButtons(root);
    }
    isHeld(button) {
        return this.held.has(button);
    }
    reset() {
        this.held.clear();
        this.moveX = 0;
        this.moveZ = 0;
        this.joystickPointer = null;
        this.updateKnob(0, 0);
    }
    bindButtons(root) {
        for (const element of root.querySelectorAll('[data-button]')) {
            const button = element.dataset.button;
            if (!button)
                continue;
            const press = (event) => {
                event.preventDefault();
                element.setPointerCapture?.(event.pointerId);
                this.held.add(button);
                element.classList.add('is-held');
            };
            const release = (event) => {
                event.preventDefault();
                this.held.delete(button);
                element.classList.remove('is-held');
            };
            element.addEventListener('pointerdown', press);
            element.addEventListener('pointerup', release);
            element.addEventListener('pointercancel', release);
            element.addEventListener('pointerleave', (event) => {
                if (event.buttons === 0)
                    release(event);
            });
            element.addEventListener('contextmenu', (event) => event.preventDefault());
        }
    }
    bindJoystick() {
        const zone = this.joystickZone;
        if (!zone)
            return;
        zone.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            this.joystickPointer = event.pointerId;
            const rect = zone.getBoundingClientRect();
            this.joystickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            zone.setPointerCapture?.(event.pointerId);
            this.updateJoystick(event.clientX, event.clientY);
        });
        zone.addEventListener('pointermove', (event) => {
            if (event.pointerId !== this.joystickPointer)
                return;
            event.preventDefault();
            this.updateJoystick(event.clientX, event.clientY);
        });
        const release = (event) => {
            if (event.pointerId !== this.joystickPointer)
                return;
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
    updateJoystick(clientX, clientY) {
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
    updateKnob(x, y) {
        if (this.joystickKnob)
            this.joystickKnob.style.transform = `translate(${x}px, ${y}px)`;
    }
}
//# sourceMappingURL=touch.js.map