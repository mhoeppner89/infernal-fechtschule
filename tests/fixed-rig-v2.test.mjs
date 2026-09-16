import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SpriteAnimationCatalog } from '../site/js/render/animation-catalog.js';
import { ANIMATION_MANIFEST } from '../site/js/render/animation-manifest.js';

const V2_PREFIX = 'assets/art-v2/';

function metadataFor(clip) {
  const baseUrl = clip.frames[0].url.replace(/\/01\.webp$/, '/clip.json');
  const path = fileURLToPath(new URL(`../site/${baseUrl}`, import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8'));
}

test('the whole cast uses the complete fixed-rig v2 inventory with one display scale', () => {
  const pilot = ANIMATION_MANIFEST.filter(
    (clip) => ['meyer', 'thug', 'spear', 'captain', 'wretch', 'grotesque'].includes(clip.archetype)
  );
  assert.equal(pilot.length, 124);
  assert.equal(ANIMATION_MANIFEST.filter((clip) => clip.availability !== 'ready').length, 0);
  const expectedCounts = { meyer: 73, thug: 14, spear: 8, captain: 11, wretch: 8, grotesque: 10 };
  for (const [archetype, count] of Object.entries(expectedCounts)) {
    assert.equal(
      pilot.filter((clip) => clip.archetype === archetype).length,
      count,
      `${archetype} clip count`
    );
  }
  assert.ok(pilot.every((clip) => clip.display.fixedScale === true));
  assert.ok(pilot.every((clip) => clip.frames.length === 6));
  assert.ok(pilot.every((clip) => clip.frames.every((frame) => frame.url.startsWith(V2_PREFIX))));

  for (const archetype of Object.keys(expectedCounts)) {
    const displays = new Set(
      pilot
        .filter((clip) => clip.archetype === archetype)
        .map((clip) => JSON.stringify(clip.display))
    );
    assert.equal(displays.size, 1, `${archetype} must use one display scale and anchor`);
  }

  for (const clip of pilot) {
    const metadata = metadataFor(clip);
    assert.equal(metadata.rootScale, 1, `${clip.id} root scale`);
    assert.deepEqual(metadata.footAnchor, [192, 350], `${clip.id} foot anchor`);
    assert.deepEqual(
      clip.frames.map((frame) => frame.cue),
      metadata.frames.map((frame) => frame.cue),
      `${clip.id} authored cues`
    );
    assert.deepEqual(
      clip.frames.map((frame) => frame.holdTicks),
      metadata.frames.map((frame) => frame.holdTicks),
      `${clip.id} authored holds`
    );
  }
});

test('reaction lookup selects head, torso, and leg clips and preserves generic fallback', () => {
  const catalog = new SpriteAnimationCatalog();
  for (const weapon of ['longsword', 'dussack']) {
    for (const zone of ['head', 'torso', 'legs']) {
      const clip = catalog.lookupActor({
        archetype: 'meyer',
        weapon,
        desiredWeapon: weapon,
        state: 'hitstun',
        reactionZone: zone
      });
      assert.equal(clip?.id, `meyer:${weapon}:hitstun_${zone}`);
    }
  }

  for (const zone of ['head', 'torso', 'legs']) {
    const clip = catalog.lookupActor({
      archetype: 'thug',
      weapon: 'longsword',
      desiredWeapon: 'longsword',
      state: 'hitstun',
      reactionZone: zone
    });
    assert.equal(clip?.id, `thug:default:hitstun_${zone}`);
  }

  const fallback = catalog.lookupActor({
    archetype: 'spear',
    weapon: 'longsword',
    desiredWeapon: 'longsword',
    state: 'hitstun',
    reactionZone: null
  });
  assert.equal(fallback?.id, 'spear:default:hitstun');

  const readiness = catalog.getReadiness();
  assert.ok(readiness.normalizedClips >= 89);
  assert.equal(readiness.minScaleCorrection, 1);
  assert.equal(readiness.maxScaleCorrection, 1);

  // Captains keep their generic guardbreak clip; every NPC archetype now
  // resolves an authored zone reaction for each of the three zones.
  for (const archetype of ['thug', 'spear', 'captain', 'wretch', 'grotesque']) {
    for (const zone of ['head', 'torso', 'legs']) {
      const clip = catalog.lookupActor({
        archetype,
        weapon: 'longsword',
        desiredWeapon: 'longsword',
        state: 'hitstun',
        reactionZone: zone
      });
      assert.equal(clip?.id, `${archetype}:default:hitstun_${zone}`);
    }
  }

  const genericReactions = [
    { archetype: 'captain', state: 'guardbreak', expected: 'captain:default:guardbreak' }
  ];
  for (const probe of genericReactions) {
    const clip = catalog.lookupActor({
      archetype: probe.archetype,
      weapon: 'longsword',
      desiredWeapon: 'longsword',
      state: probe.state,
      reactionZone: 'head'
    });
    assert.equal(clip?.id, probe.expected);
  }
});
