import type { ActionBuffer, ActionName, GuardDirection } from './types.js';

/** One short, expiring follow-up slot; fresh taps replace its intent. */
export const FOLLOW_UP_BUFFER_SECONDS = 0.26;
/** Direction is latched relative to facing at the Guard edge. */
export const GUARD_COMMAND_WINDOW_SECONDS = 0.45;
/** A four-cut string must then pay a real recovery beat. */
export const MAX_PLAYER_CHAIN_LENGTH = 4;
export type BufferedCombatAction = Exclude<ActionName, 'mobility'>;

export function guardDirectionFromInput(
  moveX: number,
  moveZ: number,
  facing: -1 | 1,
  deadzone = 0.22
): GuardDirection | null {
  const x = Number.isFinite(moveX) ? moveX : 0;
  const z = Number.isFinite(moveZ) ? moveZ : 0;
  if (Math.hypot(x, z) <= deadzone) return null;
  if (Math.abs(z) > Math.abs(x)) return z < 0 ? 'up' : 'down';
  return x * facing >= 0 ? 'forward' : 'back';
}

/** InputHub already distinguishes fresh presses from held buttons. */
export function writeActionBuffer(action: BufferedCombatAction): ActionBuffer {
  return { action, age: 0 };
}

/** Buffer age includes hit-stop, preventing delayed attacks after a long freeze. */
export function ageActionBuffer(
  buffer: ActionBuffer | null,
  dt: number,
  lifetime = FOLLOW_UP_BUFFER_SECONDS
): ActionBuffer | null {
  if (!buffer) return null;
  const age = buffer.age + Math.max(0, Number.isFinite(dt) ? dt : 0);
  return age <= lifetime ? { ...buffer, age } : null;
}
