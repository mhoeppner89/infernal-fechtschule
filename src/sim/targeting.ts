import type { Actor } from './types.js';

export interface TargetingOptions {
  maxForward: number;
  maxDepth: number;
  previousTargetId?: number | null;
}

export function chooseSoftTarget(
  attacker: Pick<Actor, 'id' | 'team' | 'x' | 'z' | 'facing'>,
  candidates: readonly Actor[],
  options: TargetingOptions
): Actor | null {
  let best: Actor | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.team === attacker.team || candidate.state === 'dead') continue;
    const forward = (candidate.x - attacker.x) * attacker.facing;
    const depth = Math.abs(candidate.z - attacker.z);
    if (forward < -28 || forward > options.maxForward || depth > options.maxDepth) continue;

    const behindPenalty = forward < 0 ? 90 : 0;
    const targetStickiness = candidate.id === options.previousTargetId ? -34 : 0;
    const score = Math.abs(forward) + depth * 1.55 + behindPenalty + targetStickiness;
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}
