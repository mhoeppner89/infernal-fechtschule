import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { BACKGROUND_MANIFEST } from '../site/js/render/background-catalog.js';

test('the street uses wide scene layers and one continuous road stretch', () => {
  const street = BACKGROUND_MANIFEST['cobbled-streets'];
  assert.deepEqual(
    street.layers.map((layer) => layer.id),
    ['far', 'middle', 'front']
  );
  assert.deepEqual(
    street.layers.map((layer) => layer.parallax),
    [0.15, 0.42, 0.7]
  );
  assert.deepEqual(
    street.layers.map((layer) => [layer.drawWidth, layer.drawHeight]),
    [[1536, 360], [2304, 360], [2560, 360]]
  );
  assert.equal(street.road?.width, 2172);
  assert.equal(street.road?.height, 724);
  assert.equal(street.road?.repeatX, false);

  const urls = [
    ...street.layers.map((layer) => layer.url),
    street.road?.url
  ];
  for (const url of urls) {
    assert.ok(url, 'every street asset has a URL');
    assert.ok(
      statSync(fileURLToPath(new URL('../site/' + url, import.meta.url))).size > 0,
      url + ' is shipped'
    );
  }
});
