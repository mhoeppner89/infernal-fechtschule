export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const lerp = (from: number, to: number, amount: number): number =>
  from + (to - from) * amount;

export const length2 = (x: number, y: number): number => Math.hypot(x, y);

export function normalize2(x: number, y: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (length < 0.0001) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

export function damp(current: number, target: number, sharpness: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-sharpness * dt));
}
