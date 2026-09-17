const TOUCH_BUTTONS = ['light', 'heavy', 'mobility', 'guard', 'switch'];
/**
 * Pointer input is deliberately kept separate from the simulation input frame.
 * Phones can deliver a complete tap between two simulation samples, and more
 * than one finger can be down at once. The maps below make those two facts
 * explicit instead of relying on a button's current DOM state.
 */
export class TouchControls {
    enabled;
    moveX = 0;
    moveZ = 0;
    // Pointer taps can begin and end between two animation frames on a phone.
    // Latch the down edge until InputHub samples it so short STEP -> CUT
    // sequences are not lost at high refresh rates.
    pressed = new Set();
    held = new Set();
    buttonPointerOwners = new Map();
    buttonPointers = new Map();
    buttonElements = new Map();
    joystickZone;
    joystickKnob;
    onPressed;
    inputBlocked;
    joystickPointer = null;
    joystickOrigin = { x: 0, y: 0 };
    joystickRadius = 1;
    joystickDeadZone = 0;
    constructor(root, onPressed = () => undefined, inputBlocked = () => false) {
        const coarsePointer = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(pointer: coarse)').matches
            : false;
        const touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0;
        this.enabled = coarsePointer || touchPoints > 0;
        this.onPressed = onPressed;
        this.inputBlocked = inputBlocked;
        this.joystickZone = root.querySelector('[data-control="joystick"]');
        this.joystickKnob = root.querySelector('[data-control="joystick-knob"]');
        this.bindJoystick();
        this.bindButtons(root);
        this.bindLifecycle();
    }
    get hasMovementPointer() { return this.joystickPointer !== null; }
    isHeld(button) {
        return this.held.has(button);
    }
    consumePressed(button) {
        return this.pressed.delete(button);
    }
    /** Release every physical owner and return the controls to a neutral frame. */
    reset() {
        this.buttonPointerOwners.clear();
        for (const pointers of this.buttonPointers.values())
            pointers.clear();
        this.held.clear();
        this.pressed.clear();
        for (const elements of this.buttonElements.values()) {
            for (const element of elements)
                element.classList.remove('is-held');
        }
        this.releaseJoystick();
    }
    bindButtons(root) {
        for (const element of root.querySelectorAll('[data-button]')) {
            const button = element.dataset.button;
            if (!button || !TOUCH_BUTTONS.includes(button))
                continue;
            const elements = this.buttonElements.get(button) ?? new Set();
            elements.add(element);
            this.buttonElements.set(button, elements);
            if (!this.buttonPointers.has(button))
                this.buttonPointers.set(button, new Set());
            element.addEventListener('pointerdown', (event) => {
                if (this.isBlocked())
                    return;
                event.preventDefault();
                // A pointer cannot own two actions. This is mostly defensive for
                // synthetic events, but it also prevents a stale capture from leaving
                // an action held when the platform retargets a touch.
                this.releaseButtonPointer(event.pointerId);
                this.capturePointer(element, event.pointerId);
                const pointers = this.buttonPointers.get(button);
                if (!pointers)
                    return;
                pointers.add(event.pointerId);
                this.buttonPointerOwners.set(event.pointerId, button);
                if (pointers.size === 1) {
                    this.pressed.add(button);
                    this.onPressed(button);
                }
                this.updateButtonVisual(button);
            });
            const release = (event) => {
                if (!this.buttonPointerOwners.has(event.pointerId))
                    return;
                event.preventDefault();
                this.releaseButtonPointer(event.pointerId);
            };
            element.addEventListener('pointerup', release);
            element.addEventListener('pointercancel', release);
            element.addEventListener('lostpointercapture', release);
            // Pointer capture normally makes pointerleave harmless. The fallback is
            // useful on browsers that expose Pointer Events without capture support.
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
            // The first finger owns the stick until it is released. A second finger
            // may use an action button, but can never move the stick's origin.
            if (this.isBlocked())
                return;
            if (this.joystickPointer !== null) {
                event.preventDefault();
                return;
            }
            event.preventDefault();
            this.joystickPointer = event.pointerId;
            const rect = zone.getBoundingClientRect();
            const width = finitePositive(rect.width) ? rect.width : 1;
            const height = finitePositive(rect.height) ? rect.height : width;
            this.joystickOrigin = { x: rect.left + width / 2, y: rect.top + height / 2 };
            const knobRect = this.joystickKnob?.getBoundingClientRect();
            const knobDiameter = knobRect && finitePositive(knobRect.width) && finitePositive(knobRect.height)
                ? Math.min(knobRect.width, knobRect.height)
                : Math.min(width, height) * 0.36;
            this.joystickRadius = Math.max(1, Math.min(width, height) / 2 - knobDiameter / 2 - 1);
            this.joystickDeadZone = this.joystickRadius * 0.14;
            this.capturePointer(zone, event.pointerId);
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
            this.releaseJoystick();
            event.preventDefault();
        };
        zone.addEventListener('pointerup', release);
        zone.addEventListener('pointercancel', release);
        zone.addEventListener('lostpointercapture', release);
        zone.addEventListener('contextmenu', (event) => event.preventDefault());
    }
    bindLifecycle() {
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('blur', () => this.reset());
            window.addEventListener('orientationchange', () => this.reset());
            // A rotation may be reported as resize on browsers without
            // orientationchange. Resetting is safer than carrying a stale origin.
            window.addEventListener('resize', () => {
                if (this.joystickPointer !== null)
                    this.reset();
            });
        }
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            document.addEventListener('visibilitychange', () => {
                if (document.hidden)
                    this.reset();
            });
        }
    }
    updateJoystick(clientX, clientY) {
        const dx = clientX - this.joystickOrigin.x;
        const dy = clientY - this.joystickOrigin.y;
        const length = Math.hypot(dx, dy);
        if (length <= this.joystickDeadZone || length <= 0.0001) {
            this.moveX = 0;
            this.moveZ = 0;
            this.updateKnob(0, 0);
            return;
        }
        // Radial normalization keeps diagonal travel on the same circle as axial
        // travel. The dead zone is removed before normalization so a tiny circle
        // around centre never becomes accidental movement.
        const magnitude = Math.min(1, (length - this.joystickDeadZone) / Math.max(1, this.joystickRadius - this.joystickDeadZone));
        const unitX = dx / length;
        const unitY = dy / length;
        this.moveX = unitX * magnitude;
        this.moveZ = unitY * magnitude;
        this.updateKnob(unitX * this.joystickRadius * magnitude, unitY * this.joystickRadius * magnitude);
    }
    releaseButtonPointer(pointerId) {
        const button = this.buttonPointerOwners.get(pointerId);
        if (!button)
            return;
        this.buttonPointerOwners.delete(pointerId);
        this.buttonPointers.get(button)?.delete(pointerId);
        this.updateButtonVisual(button);
    }
    releaseJoystick() {
        this.joystickPointer = null;
        this.moveX = 0;
        this.moveZ = 0;
        this.joystickRadius = 1;
        this.joystickDeadZone = 0;
        this.updateKnob(0, 0);
    }
    updateButtonVisual(button) {
        const isHeld = (this.buttonPointers.get(button)?.size ?? 0) > 0;
        if (isHeld)
            this.held.add(button);
        else
            this.held.delete(button);
        for (const element of this.buttonElements.get(button) ?? []) {
            if (isHeld)
                element.classList.add('is-held');
            else
                element.classList.remove('is-held');
        }
    }
    capturePointer(element, pointerId) {
        if (typeof element.setPointerCapture !== 'function')
            return;
        try {
            element.setPointerCapture(pointerId);
        }
        catch {
            // Safari can throw when a synthetic pointer has already ended. The
            // ownership maps still release normally on pointerup/cancel.
        }
    }
    isBlocked() {
        try {
            return this.inputBlocked();
        }
        catch {
            return false;
        }
    }
    updateKnob(x, y) {
        if (this.joystickKnob)
            this.joystickKnob.style.transform = `translate(${x}px, ${y}px)`;
    }
}
function finitePositive(value) {
    return Number.isFinite(value) && value > 0;
}
//# sourceMappingURL=touch.js.map