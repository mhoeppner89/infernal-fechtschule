import type { Archetype } from './types.js';

export interface SpawnSpec {
  archetype: Exclude<Archetype, 'meyer'>;
  count: number;
  interval: number;
}

export interface WaveDefinition {
  title: string;
  subtitle: string;
  groups: readonly SpawnSpec[];
  /** Offer a lesson card after this wave (combo unlock pick). */
  lessonAfter?: boolean;
  boss?: boolean;
  /**
   * Full world width of this wave's stage in logical pixels. The camera window
   * is 1280 wide; stages wider than that scroll as the player advances east.
   * Each group after the first stays dormant until the player has pushed
   * through the previous group, so the fight travels across the stage.
   */
  stageWidth?: number;
  /** Deterministic 1.0 = authored stats; >1 scales enemy health/guard/armor. */
  pressure?: number;
}

/**
 * The campaign's levels: each holds one setting (and therefore one background)
 * while its waves play out inside it. The background only changes when the
 * journey crosses a level boundary.
 */
export const LEVELS: readonly { readonly name: string; readonly waveCount: number }[] = Object.freeze([
  Object.freeze({ name: 'The Town', waveCount: 2 }),
  Object.freeze({ name: 'The Market Ward', waveCount: 2 }),
  Object.freeze({ name: 'The Castello Courts', waveCount: 2 }),
  Object.freeze({ name: 'The Castello', waveCount: 1 })
]);

/** Which level a wave belongs to; out-of-range waves clamp to the last level. */
export function levelIndexForWave(waveIndex: number): number {
  let remaining = waveIndex;
  for (let index = 0; index < LEVELS.length; index += 1) {
    remaining -= LEVELS[index]?.waveCount ?? 0;
    if (remaining < 0) return index;
  }
  return LEVELS.length - 1;
}

/**
 * The journey, staged as a steady difficulty ramp. Each level adds one new
 * idea (crowd handling → reach → armour → speed → leaders → the pit), and the
 * pressure multiplier grows smoothly toward the boss.
 */
export const WAVES: readonly WaveDefinition[] = Object.freeze([
  Object.freeze({
    title: 'The Cobbled Streets — Street Rabble',
    subtitle: 'Use broad cuts, movement, and soft alignment to keep the press in front of you.',
    groups: Object.freeze([
      Object.freeze({ archetype: 'thug', count: 5, interval: 0.44 }),
      Object.freeze({ archetype: 'thug', count: 4, interval: 0.4 })
    ]),
    lessonAfter: true,
    stageWidth: 2360,
    pressure: 1
  }),
  Object.freeze({
    title: 'The Town Gate — Pike and Press',
    subtitle: 'Spears punish a straight line. Tilt into depth or dodge across the thrust.',
    groups: Object.freeze([
      Object.freeze({ archetype: 'thug', count: 4, interval: 0.36 }),
      Object.freeze({ archetype: 'spear', count: 2, interval: 0.62 }),
      Object.freeze({ archetype: 'thug', count: 3, interval: 0.34 }),
      Object.freeze({ archetype: 'spear', count: 2, interval: 0.58 })
    ]),
    lessonAfter: true,
    stageWidth: 2820,
    pressure: 1.06
  }),
  Object.freeze({
    title: 'The Market Ward — Burning Brands',
    subtitle: 'Wretches swarm fast from both flanks. Keep the centre and cut outward.',
    groups: Object.freeze([
      Object.freeze({ archetype: 'thug', count: 3, interval: 0.34 }),
      Object.freeze({ archetype: 'wretch', count: 4, interval: 0.4 }),
      Object.freeze({ archetype: 'wretch', count: 4, interval: 0.36 }),
      Object.freeze({ archetype: 'thug', count: 2, interval: 0.3 })
    ]),
    lessonAfter: true,
    stageWidth: 2600,
    pressure: 1.12
  }),
  Object.freeze({
    title: 'The Sala d’Armi — The Armoured Lesson',
    subtitle: 'Provoke the captain, take the answer, then strike the opening.',
    groups: Object.freeze([
      Object.freeze({ archetype: 'thug', count: 3, interval: 0.32 }),
      Object.freeze({ archetype: 'spear', count: 3, interval: 0.48 }),
      Object.freeze({ archetype: 'captain', count: 1, interval: 0.9 }),
      Object.freeze({ archetype: 'spear', count: 2, interval: 0.52 }),
      Object.freeze({ archetype: 'captain', count: 1, interval: 0.9 })
    ]),
    lessonAfter: true,
    stageWidth: 2820,
    pressure: 1.18
  }),
  Object.freeze({
    title: 'The Courts — Captains Twice Named',
    subtitle: 'Two armoured captains command the court. Separate them or be caught between.',
    groups: Object.freeze([
      Object.freeze({ archetype: 'spear', count: 3, interval: 0.46 }),
      Object.freeze({ archetype: 'captain', count: 2, interval: 1.1 }),
      Object.freeze({ archetype: 'thug', count: 4, interval: 0.32 }),
      Object.freeze({ archetype: 'captain', count: 2, interval: 1.0 })
    ]),
    lessonAfter: true,
    stageWidth: 2820,
    pressure: 1.26
  }),
  Object.freeze({
    title: 'The Crypt Stair — The Bound Press',
    subtitle: 'Chains rattle below. Everything the castle bound is climbing to meet you.',
    groups: Object.freeze([
      Object.freeze({ archetype: 'wretch', count: 5, interval: 0.38 }),
      Object.freeze({ archetype: 'thug', count: 4, interval: 0.3 }),
      Object.freeze({ archetype: 'wretch', count: 5, interval: 0.34 }),
      Object.freeze({ archetype: 'captain', count: 1, interval: 0.9 }),
      Object.freeze({ archetype: 'spear', count: 3, interval: 0.44 })
    ]),
    lessonAfter: true,
    stageWidth: 2820,
    pressure: 1.34
  }),
  Object.freeze({
    title: 'The Castello — The Bound Grotesque',
    subtitle: 'The crypt chains snap. Survive the sweep, parry the claw, and put the bound thing down.',
    groups: Object.freeze([
      Object.freeze({ archetype: 'grotesque', count: 1, interval: 0 })
    ]),
    boss: true,
    stageWidth: 2360,
    pressure: 1.45
  })
]);
