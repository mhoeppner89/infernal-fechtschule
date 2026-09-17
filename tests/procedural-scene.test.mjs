import test from 'node:test';
import assert from 'node:assert/strict';
import { ProceduralSceneRenderer } from '../site/js/render/procedural-scene.js';

const SCENES = ['cobbled-streets', 'town-gate', 'sala-darmi', 'castello'];

function recordingContext() {
  const trace = [];
  const target = { trace };
  return new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      if (property === 'createLinearGradient' || property === 'createRadialGradient') {
        return (...args) => {
          trace.push([property, args]);
          return { addColorStop: (...stopArgs) => trace.push(['addColorStop', stopArgs]) };
        };
      }
      const method = (...args) => trace.push([property, args]);
      object[property] = method;
      return method;
    },
    set(object, property, value) {
      if (property !== 'trace') trace.push([property, value]);
      object[property] = value;
      return true;
    }
  });
}

function renderScene(scenery) {
  const context = recordingContext();
  const renderer = new ProceduralSceneRenderer(1280, 720);
  renderer.setContext(context);
  renderer.draw({
    scenery,
    time: 1.25,
    bossPhase: 0,
    roadWidth: 2600,
    lane: null,
    exitOpen: false
  }, 0, 1 / 60);
  return context.trace;
}

test('each campaign scenery renders distinct procedural geometry without assets', () => {
  const traces = SCENES.map(renderScene);
  assert.ok(traces.every((trace) => trace.length > 100), 'each scenery has substantial geometry');
  assert.ok(traces.every((trace) => trace.some(([name]) => name === 'fillRect')));

  const signatures = traces.map((trace) => JSON.stringify(trace));
  assert.equal(new Set(signatures).size, SCENES.length, 'scene identities collapse to one drawing');
});
