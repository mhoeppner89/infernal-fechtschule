export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (from, to, amount) => from + (to - from) * amount;
export const length2 = (x, y) => Math.hypot(x, y);
export function normalize2(x, y) {
    const length = Math.hypot(x, y);
    if (length < 0.0001)
        return { x: 0, y: 0 };
    return { x: x / length, y: y / length };
}
export function damp(current, target, sharpness, dt) {
    return lerp(current, target, 1 - Math.exp(-sharpness * dt));
}
//# sourceMappingURL=math.js.map