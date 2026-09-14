# Fixed-rig art v2 (full cast)

This directory holds the deterministic fixed-rig sprites for every archetype:
Meyer (longsword and dussack), thug, spear soldier, armoured captain, wretch,
and the Bound Grotesque. The original `assets/art` set remains for the retired
v1 fallback paths.

## Cast inventory

| Actor | Clips | Weapon folder | Authored states |
|---|---|---|---|
| Meyer | 50 | `longsword/`, `dussack/` | full kit incl. zone reactions |
| Thug | 14 | `club/` | idle, move, crouch, dodge, block, reactions, attacks |
| Spear | 5 | `spear/` | idle, move, hitstun, dead, thrust |
| Captain | 8 | `captain-sword/` | idle, move, block, hitstun, guardbreak, dead, cut, bash |
| Wretch | 5 | `claws/` | idle, move, hitstun, dead, claw |
| Grotesque | 7 | `claws/` | idle, move, hitstun, dead, sweep, leap, shock |

## Contract

- Runtime frames: `{actor}/{weapon}/{clip}/01.webp` through `06.webp`
- Canvas: 384×384 RGBA, lossless WebP
- Registration: bottom-centre `[192, 350]`
- Canonical root scale: `1.0` for every clip and frame
- Attacks: anticipation → contact → overshoot → recovery, with one contact frame
- Source rigs: `source/rigs/*.json`
- Separate weapon attachments: `source/weapons/*.json`
- Integration metadata: `manifest-v2.json` and each clip's `clip.json`

The generator evaluates the same bone lengths for every pose. It never measures
rendered alpha to resize a frame, and there are no per-animation scale
overrides. Crouching and falling therefore change the silhouette naturally
without changing character proportions.

## Rebuild and validate

```sh
python3 tools/generate-fixed-rig-art-v2.py
python3 tools/validate-fixed-rig-art-v2.py --verify-rebuild
```

The validator checks the full pilot inventory, fixed scale, source canvas,
transparent margins, frame checksums, kinematic bone lengths, and a maximum
one-pixel ground-row drift. `--verify-rebuild` also regenerates the complete set
and compares every runtime-frame checksum.

## Renderer integration

Every archetype uses one fixed display spec, not the v1 ink-mass calibration:
`anchorX: 0.5`, `anchorY: 350 / 384`, `fixedScale: true`, and per-archetype
drawn heights (188 Meyer, 174 thug, 181 spear, 196 captain, 162 wretch, 278
grotesque in the 1280×720 logical renderer). The thug's generic `hitstun`
folder is its torso-reaction fallback; the zone-specific folders are
`hitstun_head`, `hitstun_torso`, and `hitstun_legs`. All other archetypes keep
their generic hitstun for every zone.

The `dodge` clip is intentionally input-relative: the renderer can flip the
same stable silhouette with actor facing while movement remains simulation-side.
