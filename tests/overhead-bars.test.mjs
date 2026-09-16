import test from 'node:test';
import assert from 'node:assert/strict';

import { BAR_LIFT } from '../site/js/render/canvas-renderer.js';
import { ANIMATION_MANIFEST } from '../site/js/render/animation-manifest.js';

/**
 * Little Fighter 2 puts each fighter's life bar above its head. The lift is
 * authored per archetype, so taller art or a new archetype must not silently
 * end up with a bar drawn across its chest.
 */

/** The renderer draws the bound thing larger than its authored display spec. */
const RENDER_SCALE = { grotesque: 1.18 };

test('every archetype carries its life bar above its own head', () => {
  const archetypes = ['meyer', 'thug', 'spear', 'captain', 'wretch', 'grotesque'];
  assert.deepEqual(Object.keys(BAR_LIFT).sort(), [...archetypes].sort());

  for (const archetype of archetypes) {
    const display = ANIMATION_MANIFEST.find((clip) => clip.archetype === archetype)?.display;
    assert.ok(display, `${archetype} has no display spec`);
    const tallest = display.height * (RENDER_SCALE[archetype] ?? 1);
    assert.ok(
      BAR_LIFT[archetype] > tallest,
      `${archetype} bar lifts ${BAR_LIFT[archetype]} but the sprite is ${tallest.toFixed(0)} tall`
    );
  }

  // The bound thing is the tallest silhouette in the cast and still needs room
  // above its head for the bigger bar.
  assert.ok(BAR_LIFT.grotesque > BAR_LIFT.meyer);
});
