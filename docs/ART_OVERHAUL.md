# Art overhaul — work order

This is the production brief for replacing the procedural graybox with authored art. It is
written to be fed to an image generator **one clip at a time**: every clip below is a
self-contained unit with a reusable style block, a frame-by-frame pose list, and the exact
folder it lands in.

Scope of this pass:

- **Meyer, longsword**: three signature combos, drawn in full. §8.
- **Everything else** — his dussack, club and spear, and all five opponent archetypes —
  keeps the **standard idiom**: one light, one heavy, one low, and the state set. §7.
- **The road, the tapestry backdrop, the weapons as objects, the cast costumes.** §3–§6.

Out of scope: simulation changes, hit effects and particles (drawn in code, §10), UI chrome,
codex illustrations, portraits.

---

## 1. How a clip is made

### The unit of work

One **clip** = one animation = **one strip image with six separated figures** = one folder
under `site/assets/art-v2/<actor>/<kit>/<clip>/` holding `01.webp … 06.webp` and `clip.json`
(the normalizer leaves the lossless `01.png`s and its `normalization.json` audit beside them,
as the rig generator does — keep both).

Six frames per clip is not a suggestion. `tests/fixed-rig-v2.test.mjs` asserts that every
clip in `ANIMATION_MANIFEST` has exactly six frames and that its cues and holds match its
`clip.json`, and the whole timing model rests on that: one fixed six-pose track per clip,
with the authored holds stretched to whatever duration the state or attack actually runs.

### Two routes to a strip

**Route A — text to strip.** Prompt the model for one row of six figures on transparency,
then normalize. Use this when there is no earlier pose to build from.

**Route B — rig block, then paint (preferred).** `tools/generate-fixed-rig-art-v2.py`
already renders the pose deterministically from a rig: torso angle, root offset, four limb
chains, weapon angle, expression. Render the six frames of the clip you want, hand the model
that strip as a *reference/control* image, and ask it to repaint the same six poses in the
house style without moving any joint. Proportions, foot registration and weapon length then
survive by construction, and the model only has to do what it is good at (line, colour,
cloth, face). §8's poses are written so they can be blocked that way: the decisive frames
name the joints that carry the read — which hand is high, where the point is, where the
weight and the eyes are — rather than only the look of the finished drawing.

### Normalizing and installing

```bash
# 1. Strip -> six frames, one shared scale, one bottom-centre anchor.
python3 tools/normalize-animation-strip.py \
  <strip>.png site/assets/art-v2/meyer/longsword/ls_twerch \
  --frames 6 --canvas 384x384 --padding 20 \
  --runtime-webp-size 384x384 \
  --preview /tmp/art-review/ls_twerch.png

# 2. Install: footAnchor (192, 350) must survive, ground drift <= 1 px.
python3 tools/validate-fixed-rig-art-v2.py --assets site/assets/art-v2

# 3. Look at the whole kit at once, at phone scale, in motion.
node tools/animation-gallery-probe.mjs
```

`normalize-animation-strip.py` finds the six largest connected alpha shapes and assigns
small detached marks (a bead, a plume, a hilt lying apart) to the nearest pose, so the
figures only have to be *separately readable* — they do not have to sit on exact cell
boundaries. If two poses touch (a long thrust whose blade reaches the next figure), pass
`--x-cuts`. When a generated pose is unusable, `--repeat-frame 4:1` substitutes a good one
rather than failing the batch.

### What the validator will hold you to

`tools/validate-fixed-rig-art-v2.py` is what turns "looks fine" into a pass:

- **Anchor:** the lowest ink in every frame is row **350 ± 1** — a figure standing on a
different floor line fails, which is the mechanical statement of "never draw anyone in the
air".
- **Safety margin:** at least **1 px of transparency** on the left, the top and the right of
every frame, and all four canvas corners empty. Nothing may touch an edge.
- **Checksums:** every frame's `sha256` in `clip.json` must match the file on disk.
- **Proportions:** for every rig-authored frame, each bone's length in the recorded
  landmarks must match the rig's declared proportions. This is why §1's **Route B matters
  beyond convenience**: a repaint that keeps the six blocked poses keeps the landmarks
  valid, while a free-generated pose has no landmarks at all.

**One small tool is needed by this pass.** `clip.json` currently comes out of
`generate-fixed-rig-art-v2.py`, so art that did not come from the rig has no metadata.
Add a `--refresh-metadata` mode to the validator (or a five-line script beside it) that
rewrites each frame's `alphaBBox`, `groundRow` and `sha256`, and keeps the landmarks where a
rig block supplied them.

### The strip the model must hand back

- **One row, left to right, in playback order**, six figures.
- Real **alpha** (`normalize-animation-strip.py` refuses an opaque image). If the model
  returns a flat colour, key it out before normalizing.
- **No shadows, no ground line, no frame, no border, no caption, no signature, no
  watermark.** The renderer draws the shadow; a baked one doubles it.
- **At least ~90 px of clear space between poses**, no overlapping limbs, **no motion
  smear crossing into another pose**. A directional smear inside a pose is fine and wanted.
- **1 px of clearance on every edge of a pose**, and every figure's lowest ink on the shared
  floor line — the pose may not touch its own bounding edges (the validator checks this).
- Every figure **the same height**, standing on **one shared floor line**, feet **flat and
  level** — including a figure the pose has airborne, which is impossible here: nothing is
  ever drawn off the floor line (§2).

### Assembling a prompt

Four blocks, in this order, no edits:

1. `STYLE` (§2.1) — verbatim.
2. `ACTOR` (§6.1) — the costume and palette paragraph for the actor.
3. `CLIP` — the clip's frame table from §8 (or §7 for the standard idiom).
4. `NEGATIVE` (§2.5) — verbatim.

---

## 2. The picture

### 2.1 STYLE — copy this block verbatim into every prompt

```text
STYLE
Single full-body figure of a fencer, drawn in the manner of an early
sixteenth-century printed fencing book: bold even black contour, interior shading
built ONLY from parallel hatching and cross-hatching, flat opaque colour fields
inside the lines. No gradients, no soft shading, no airbrush, no glow, no cast
shadow, no highlight beyond bare skin or paper white. Dry, crisp, carved line
quality — woodcut and engraving, not watercolour and not cel-shaded anime.

Colour is restricted to the attached flat palette and nothing else. Line weights:
outer contour 3–4 px, interior hatching 1.5–2 px at the delivered size.

The figure stands in three-quarter profile FACING RIGHT, feet flat and level on
one shared floor line, whole body and whole weapon inside the frame, weight
forward, knees soft. Historical 1520s German costume; anatomically solid, stolid,
slightly heavy — a fencing master, not a hero.

No frame, no border, no ground, no floor, no shadow beneath the feet, no
background scenery, no text, no signature, no watermark: the figure is alone on
transparent background.
```

### 2.2 Why this medium

Three reasons, and they are the reasons the rest of the brief takes the shape it does:

- **The line is the game.** Fighting-game readability at phone scale is a silhouette
  problem, and a heavy contour on a flat field is the cheapest way to win it. It is also
  Little Fighter 2's own trick: crisp, high-contrast figures over a quiet ground.
- **It is period-true.** The chained wretches and the grotesque are already drawn from
  printed grotesques and margin ornaments (`docs/HISTORICAL_METHOD.md`). Line art is the
  idiom the game's own fiction is quoted from, so the cast, the fixtures and the scenery can
  all share one hand.
- **It forgives generation.** Hatching and flat fills hide the small anatomical lies an
  image model makes; a rendering treatment would expose every one of them.

### 2.3 Colour is a lock, not a suggestion

The palettes in `site/assets/art-v2/source/rigs/*.json` are the authoritative colours.
`tools/stylize-runtime-art.py` snaps every numbered runtime frame to one fixed palette per
actor, so drift between frames is repaired automatically — but repaired, not hidden: paint
inside the palette and the pass is a no-op. (That tool belongs to the v1 pass and reads the
source tree at `art-source/v1/`; for repainted v2 clips, palette lock is the prompt's job,
which is why §6.2 quotes the hex.) The tables in §6.2 are those files, so a prompt can quote
hex directly.

Scenery is deliberately **not** palette-locked, and is treated with a wider palette and less
smoothing so it recedes without posterising.

### 2.4 The figure on screen

| Fact | Value |
|---|---|
| Source canvas per frame | 384 × 384 px |
| Floor line — the feet | row **350**, both feet: the *lowest ink* of the frame |
| Horizontal registration | column **192** (bottom-centre anchor) |
| Drawn size | the 384 px canvas is drawn **188 logical px** tall in a 1280 × 720 arena |
| So, figure size | a body occupying rows 90–350 reads ≈ 127 px on a 720 px screen |
| Spare canvas | rows 0–30 free for a raised weapon; rows 350–384 are never drawn |
| Facing | authored **facing right**; the renderer mirrors with `scale(facing, 1)` |
| Ground drift | ≤ 1 px between the six frames (validated) |

Two consequences worth stating because they are the two things that most often break a
generated clip:

- **Nothing may be cropped by the canvas edge.** The blade, a plume or an elbow outside the
  384 px box is gone. The rig's own answer to a long weapon is to *brace* it back — the
  spearman plants the shaft instead of lunging, and Meyer braces it further still.
- **Nothing is ever airborne in the art.** The renderer adds the jump offset in code, and
  the validator holds every frame to the floor line. A leaping pose must be authored with
  the feet *down*; the lift comes from the sim.

### 2.5 NEGATIVE — copy this block verbatim into every prompt

```text
NEGATIVE
no background, no scenery, no floor, no ground shadow, no drop shadow, no frame or
border, no text, no caption, no signature, no watermark; not 3D, not anime, not
cel-shaded, not watercolour, not oil painting, not airbrush, not photorealistic, no
gradients, no glow, no lens flare, no motion blur across poses, no duplicate or extra
limbs, no extra weapon, no two-handed grip on a one-handed weapon, no cropped blade,
no figure smaller or larger than its neighbours, no perspective floor grid.
```

---

## 3. The road

### 3.1 What the road is today, and the one thing wrong with it

The ground the fighters stand on is **baked into the parallax backdrop**: the cobbles are
part of the 1280-wide background image, drawn at 0.35× camera speed. So a fighter walking
100 px travels 35 px of cobble. It has passed unnoticed because the backdrop is soft, but
it is wrong, and it caps how much detail the road can carry — detail *shows* the slip.

The overhaul therefore splits the picture into three planes:

| Plane | Speed | Contents | Where it is drawn |
|---|---|---|---|
| Wall | 0.35× camera | the tapestry (§4) | `drawBackgroundImage`, behind everything |
| **Road** | **1.0× camera** | tileable ground under the cast | new layer, between the wall and the actors |
| Furniture | 1.0× camera | boundary posts, the choke funnel, the gate, kerbs | already in code, unchanged |

That is one added layer in `canvas-renderer.ts` (a tile loop) and the road detail coming out
of the four backdrops. Nothing else moves.

### 3.2 The road's geometry — exact, and required by the art

```text
screen y
   0 ┌───────────────────────────  tapestry wall (parallax 0.35×)  ──────────┐
     │                                                                       │
 232 ├───────────────────────────  road shoulder / far kerb  ────────────────┤
     │                                                                       │
 248 │  ......................... walkable depth starts (ARENA.minZ) ......  │
     │                        ...................................            │
     │     fighters' feet live in here (364 px of depth, z 248 … 612)        │
 612 │  .......................... walkable depth ends (ARENA.maxZ) .......  │
     │                                                                       │
 624 ├───────────────────────────  near kerb / road edge  ───────────────────┤
     │            dark foreground band (code: drawPlayfieldFocus)            │
 720 └───────────────────────────────────────────────────────────────────────┘
```

- The road's **length is authored per level** — The Town is 2360 px of street — and the
  camera shows a **1096 px window** of it. So every road asset must tile cleanly: the player
  walks up to 2360 px past it and never sees an edge or a seam.
- The walkable **depth** is 364 px (z 248 … 612). A narrow place squeezes the depth, never the
  length.
- Drawn figures are scaled by depth: **0.86 at the far edge (z 248) to 1.04 at the near
  edge (z 612)** — a 21 % size swing the art must not fight. Keep the road's stone size
  roughly constant across the band; the perspective is carried by the figure scale.
- The choke funnel (§3.4) narrows the depth band to as little as **162 px** (z 360…522),
  so the road art has to read at both widths.

### 3.3 Road deliverables

| Id | Size | Tiling | Brief |
|---|---|---|---|
| `road/cobbles` | **512 × 392** | horizontal, seamless | Set cobbles in irregular courses running *across* the road, not down it: stones 26–44 px, wide joints of dark sand, a thin rim of light on each stone's top edge only (the key light is upper-left). Ten or twelve stones visibly worn smooth and pale, the rest darker, so the eye has something to follow while running. No perspective convergence — the far stones are the same size as the near ones. |
| `road/cobbles-worn` | 512 × 392 | horizontal, seamless | The same tile with one cart rut, a patch of mud and two or three missing stones. Lay it over `cobbles` at 40 % in a level's mid-section so a long road has a middle. |
| `road/kerb` | 512 × 24 | horizontal, seamless | The far shoulder: a mended stone kerb, half-buried, with weeds in the joints (level-tinted: none in the Castello). |
| `road/floor-boards` | 512 × 392 | horizontal, seamless | *The Sala d'Armi* only: a swept plank floor with straw, sanded boards 40 px wide, a worn practice ring's arc crossing the tile so the ring reads once every few tiles. |
| `road/rammed-earth` | 512 × 392 | horizontal, seamless | *The Castello* only: packed earth and flagstone fragments, wet, with a shallow drainage channel along the near edge. |

Palette anchors for the road (sample from the backdrop, keep the road 15–20 % darker than
the wall so the figures separate): stone `#8c8375` light / `#5f584e` mid / `#3a352f` dark,
sand `#a1937a`, mud `#4a3d31`, floor boards `#a97a4a` / `#7d5530`, rammed earth `#5b4a3c`.

### 3.4 What the code draws over the road (leave room for it)

- **The road's extent** — a 3 px light outline drawn in world space around the whole road
  (18 px outside each end, from y 232 to y 624), which scrolls with the march. So the road
  tile should be quiet at both its own long edges: a bright or busy hem reads as a seam
  against that outline.
- **The choke funnel** — bollards on both shoulders following the narrowing curve, with a
  darkened, drained surface between them. Paint the road so *barrels, bollards and market
  stalls* belong on it: the funnel should look like a street narrowing past fixtures, not a
  corridor drawn on open ground. (Fixture sprites: `props/bollard`, `props/barrel`,
  `props/stall` — 96 × 128, one pose each, ink-and-flat like the cast.)
- **The gate** — two stone posts and a barred opening, drawn from `y 268` to `y 628`. It is
  furniture standing on the road; keep the road's near kerb out of that band.
- **The amber wash** when the way out opens, and the darker wash when it is barred. Design
  the road so a warm light over it reads: the stones should not already be golden.

---

## 4. The tapestry — the background

### 4.1 The idea

Each place is staged in front of a **wall-hung tapestry**: one great woven hanging, seen
flat, filling the picture above and behind the road. The fight happens in front of a piece
of cloth. This buys four things at once:

- a coherent identity for four places without four painted panoramas;
- a surface that is *legitimately* low-contrast and low-detail, so line-art fighters always
  read against it (LF2's separation trick; `docs/VERTICAL_SLICE.md`: "effects must preserve
  silhouettes and attack lines");
- the historical frame the game already claims — a fencing hall, a burgher's hall, a crypt
  with hangings — and a place for the infernal arc to live as *imagery* rather than as
  monsters in a corridor;
- the woven picture can show the story (vignettes, motto bands, borders) that a generic
  skybox cannot.

**In-world justification is part of the brief.** The hangings carry the place's own
propaganda: a town's trade and its guilds, the gate's muster roll, the fencing hall's
figures, the castle's hunting and its chains.

### 4.2 The canvas and the safe window

The renderer draws the backdrop into a 1920 × 1104 box at `(parallax − 12, −24)`, and the
source art is 1280 × 720 today — so it is upscaled 1.5× *and* stretched 2.2 % vertically,
and its bottom 224 px are never on screen at all.

**Deliver tapestry art at 1920 × 1080, and let it be drawn 1:1.** That is one number in
`drawBackgroundImage` (`1104` → `1080`), removes the upscale and the stretch, and matches
what image models produce natively.

```text
source 1920 × 1080, drawn at (parallax − 12, −24), parallax ∈ [−640, −12]

  source y   0 ─ 24      cropped above the screen:  put nothing here
  source y  24 ─ 232     the band that is always seen — the vignette lives here
  source y 232 ─ 744     the road, kerbs, furniture and the cast cover this
  source y 744 ─ 1080    never seen: keep it dark, quiet, and cheap

  source x  12 ─ 1920    all of it is used at some point in the walk
  source x   0 ─ 12      cropped: nothing here
```

So: **compose the picture for a 1920 × 208 strip above the road, and a 1920 × 512 field
behind it that only ever shows through gaps.** The one thing to get right is the bottom
edge of the hanging — its fringe and border — which must sit in the source band
y 200–420 where the road's far kerb meets it.

### 4.3 The weaving language (shared by all four)

- **Warp and weft are visible.** A fine regular weave of horizontal and vertical thread,
  and the image is built like a weave: flat colour areas with *stepped, staggered edges*
  (weft-faced tapestry cannot do a smooth diagonal), slits where two colour blocks meet,
  and visible thread direction inside each shape.
- **Three threads per colour.** Every colour is one flat thread tone plus a lighter
  highlight thread laid on top, never a blend.
- **The border.** A woven border 120 px deep on all sides: a repeating geometric band, a
  motto band on the upper border in woven Gothic blackletter (text is *woven*, not printed),
  and a **fringe** of threads hanging 40 px along the bottom border, each thread slightly
  disturbed, so the cloth reads as hanging rather than painted.
- **The key.** Upper-left, warm, even — the same key as the cast. Deep folds read as woven
  shadow bands (2–3 stepped tones), never as gradients.
- **The scale of the vignettes.** Figures inside the hanging are **one third to one half the
  size of the cast** and much lower contrast (they are cloth). They may be partial, repeated
  in a frieze, or shown as a heraldic device.
- **No lettering of the game's own UI, no modern heraldry, no real coats of arms.** The
  motto bands are woven pseudo-Gothic, legible as lettering at a glance and not readable.

### 4.4 The four hangings

| Level | Scenery id | Size | The hanging |
|---|---|---|---|
| The Town | `cobbled-streets` | 1920 × 1080 | **The Guilds' Hanging.** A market street in frieze: booths with awnings, a fishwife, a cooper rolling a barrel, two burghers arguing over a purse, dogs. Warm ground: ochre, madder red, woad blue, undyed cream, with a deep verdigris border. Motto band reads as if it says *the town keeps its own peace*. The weave is fresh and bright — this is the hanging the town is proud of. |
| The Town Gate | `town-gate` | 1920 × 1080 | **The Muster Roll.** A gate wall with its portcullis, a muster of spearmen in ranks, a drummer, a herald on the wall, banners at the top edge. Colder, greyer, more wool: slate blue, iron, dark green, bone. The border is plain and repaired in places (this is an old hanging, patched after a siege). |
| The Sala d'Armi | `sala-darmi` | 1920 × 1080 | **The Master's Hanging.** The fencing hall's own tapestry, and the most precise of the four: a grid of small paired fencers in the guards — one pair high, one pair low, one pair crossing — copied in spirit from Meyer's own figure plates, with an oak-and-laurel border and a motto band. Cleanest weave, most contrast, the richest colour (madder, gold, ink blue). This is where the game wants a *studio* feel. |
| The Castello | `castello` | 1920 × 1080 | **The Crypt Hanging.** Old, dark, and damaged: a hunt in the upper field that turns into grotesques in the margin — chained shapes, a jaw, a claw, things that were once decorative — with the lower third gone to rot and dull metal thread. Bone, umber, rust, and a single ember orange used *once* per repeat. The fringe is broken and hanging in threads. |

Between places the renderer cross-fades over 0.55 s, so the two hangings must share a
palette of temperature at their edges: keep stone, bone and wool tones in every one.

### 4.5 The corruption overlay (the finale)

`drawInfernalCorruption` is already called at `bossPhase ≥ 1`. Deliver it as **two overlay
sheets, 1920 × 1080, transparent**:

- `walls/corruption-1` — the weave darkening from the bottom: threads pulling apart, slits
  opening, a rust stain spreading up the cloth, the fringe burning. ~35 % opacity feel.
- `walls/corruption-2` — the hanging turned: blackened threads, a great torn hole, chains
  showing *through* the cloth as if behind it, embers in the weave. ~60 % opacity feel.

They are drawn over whichever hanging is current, so they must not rely on its colours: use
black, ember and rust only.

---

## 5. Weapons as objects

### 5.1 Carried weapons are not sheets

A carried weapon is painted into the actor's own clips. The rig attaches it to `frontWrist`
and it is drawn from `source/weapons/*.json`, one dataclass per weapon with length, blade
width, guard width and grip length. Poses are blocked with the weapon in hand — a strip is
never "a body, plus a sword stuck on later".

| Weapon | Id | length | Drawn character |
|---|---|---|---|
| Longsword | `longsword-v2` | 132 | Meyer's own: long straight double-edged blade, wide straight crossguard, scent-stopper pommel, worn leather grip. Blade `#d8deda`, edge `#f5f0d6`, hilt dark `#6b7374`, grip `#4c3027`, guard brass `#c39b3d`. |
| Dussack | `dussack-v2` | 86 | A short broad single-edged blade with a thick spine and a light guard, carried like a tool. |
| Cudgel | `club-v2` | 94 | A knotted oak club with an iron band at the head — a *find*, not a weapon: crude, chipped, unpolished. |
| Spear | `spear-v2` | 92 | A campaign shaft with a leaf head and a banded socket, drawn *braced* and short in frame because a full 2 m shaft will not fit the canvas. |
| Captain's sword | `captain-sword-v2` | 96 | Shorter, heavier, blade with a fuller, brass guard, and the shield is part of the same attachment. |
| Thug's club | `club-v2` | 94 | Same object as Meyer's find — it is the same found weapon, so the silhouette matches when it drops. |

### 5.2 Items on the ground: one small atlas

Weapons the player can take, hurl and break are on the floor most of the time, and today
they are drawn as vector shapes in code (`drawItem`, `drawCudgel`, `drawShaft`). The
overhaul replaces them with one atlas each, because a lying weapon is a *silhouette the
player must read* — and it must match the carried one.

| Asset | Size | Poses |
|---|---|---|
| `items/longsword-ground` | 256 × 96 | 1: lying, point left, hilt right, dust shadow omitted |
| `items/dussack-ground` | 192 × 96 | 1 |
| `items/cudgel-ground` | 192 × 96 | 1 |
| `items/spear-ground` | 384 × 72 | 1 |
| `items/flask` | 96 × 128 | 2: upright, and one with the draught's glow (drawn animated, so a two-frame pulse) |
| `items/thrown-spin` | 192 × 192 | 4: the hurl tumbling end over end, 90° apart, reused in code |
| `items/offer-ring` | 192 × 96 | 1: the invitation mark for a thing within reach — a woven, chalked arc on the ground, in the same ink as the cast, plus the item's own name-glyph space left empty for code |

Pivot for every ground item: **bottom-centre**, so it drops onto its z exactly like a
fighter.

---

## 6. The cast

### 6.1 ACTOR blocks — copy verbatim

```text
ACTOR — Joachim Meyer (meyer)
A fencing master of about forty: burgundy slashed doublet with gold lacing over a
cream shirt with full cuffs, charcoal breeches with red panes, dark hose, soft
brown boots to mid-calf, a short clipped beard, and a small feathered cap. Sleeves
buttoned back. He carries himself with a teacher's economy: still, heavy, no wasted
gesture, and he never hurries a pose.
Palette: ink #25191a, skin #d9a06e, skin light #efc18b, hair #4b2c22, doublet
#8f2638, doublet dark #5d1d2c, cloth light #ead9b8, breeches #3f3a38, hose #9b2634,
leather #54382d, gold #d8a83c, steel #cfd5d2, steel dark #6f7778.
Height on the shared grid: the tallest man in the game (torso 68, shoulders 70).

ACTOR — Thug (thug)
A compact mercenary bruiser: patched brown jerkin over rolled cream sleeves, a
leather jack with studs, charcoal hose, an ochre sash, a brown cap, work boots and
leather gloves. He is shorter than Meyer and wider, and his shoulders sit forward —
a man who swings from the shoulder.
Palette: ink #211b18, skin #b97852, skin light #d89a6b, hair #2d2520, tunic
#e0d1ae, tunic dark #9d8c70, brigandine #70462f, hose #4c4a46, leather #493328,
accent #bd8731, metal #9ea6a2, wood #80532d, wood light #b47a3b.
He carries the crude found cudgel: a knotted oak club with an iron band.

ACTOR — Spear soldier (spear)
A town-gate soldier: a slate-blue waffenrock over mail sleeves, a steel kettle hat,
leather vambraces, mud-brown boots, a shoulder-belt across the chest.
Palette: ink #1e1a20, skin #c08a5e, skin light #dba97c, hair #33261d, waffenrock
#4a5578, waffenrock dark #333c58, cloth light #cfc4a6, mail #8d9498, mail dark
#5f676c, hose #5a4a3a, leather #4f3a2a, accent #93312e, steel #c3c9c6, steel dark
#6d7576.
He holds the campaign spear braced and short — the whole shaft must stay inside
the frame.

ACTOR — Town captain (captain)
An armoured town captain: a blackened breastplate and pauldrons over a padded
crimson doublet, an open sallet with a feather plume, a mail skirt, reinforced
boots. Bulkier and taller than Meyer, and completely unhurried.
Palette: ink #1a1514, skin #c99265, skin light #e4b283, hair #3a2a1e, plate
#58514c, plate light #8a827b, plate dark #322d2a, doublet #8c2432, cloth light
#d8c6a4, mail #969da1, hose #463c33, leather #4a3428, accent #d8a83c, plume
#b4552f.
He carries a shorter heavy sword and a round shield in the same attachment.

ACTOR — Crypt wretch (wretch)
A gaunt crypt wretch: ashen grey skin, rust-stained rag wrappings, a broken chain
collar with a hanging ring, blackened claws, bare feet. Thinner and shorter than the
thug, shoulders hunched, and its head leads its body.
Palette: ink #191414, skin #9a8f85, skin light #b8aea4, hair #241d1a, rag #5d5148,
rag dark #413830, rust #8a4a2e, chain #7c7468, chain light #a39a8b, claw #2e2622,
accent #7a2f28, leather #3f2f26.
It has no weapon: the weapon is the claws.

ACTOR — The Bound Grotesque (grotesque)
A hunched crypt horror, one and a half times a man: cracked grey-brown hide over a
massive frame, blackened chain wrapped across the chest and arms with iron bands, a
heavy jaw, no neck to speak of, and a single ember glow between the plates.
Palette: ink #140f0e, skin #7d7166, skin light #9c9084, hide #64594d, hide dark
#463d34, plate #4d433c, plate light #75695f, rust #7c4426, chain #5c5348, chain
light #867c6e, ember #c96a2a, accent #8c2f24, claw #2a2320, leather #382c23.
He fills the frame: keep his mass low and forward, and never let him stand upright.
```

### 6.2 Silhouette rules

- **Read in one colour.** If the six figures of a clip are flattened to black, the action
  must still be legible: which way he is going, which hand holds the weapon, where the point
  is. Test every strip this way before installing it.
- **Two silhouettes per actor.** A rest family and a strike family. Never let a strike
  return to the rest silhouette inside the active window.
- **The weapon is part of the outline**, not drawn over it: blade against sky, hilt over the
  body — except at contact, where the blade crosses the body deliberately.
- **Faces**: three-quarter, four expressions only — composed (default), intent (attack),
  hurt (under a hit), dead. The face is small; the read is in the brow and the jaw, never in
  the eyes.
- **One actor's weapon never overlaps another's** in the art — the overlap happens in the
  game.

---

## 7. The standard idiom — everyone except Meyer's longsword

Every actor owns **one state set and three attacks**, and nothing else, for now — twelve
clips of state for Meyer (nine states plus the three zone reactions), eleven for the thug,
nine for the captain, seven each for the spearman, the wretch and the grotesque, plus the
three attacks. Those sets are already declared in `ANIMATION_INVENTORY`; this pass keeps
them exactly as they are.

A weapon kit is *the same pose strips with a different weapon in hand*, which is why §1's
Route B is fast: block one set once, then repaint the strip per kit.

### 7.1 The states

**Every live clip today holds `4,5,3,3,5,5` ticks (67, 83, 50, 50, 83, 83 ms) and only the
*cues* differ** — the authored holds in the table below are the ones to use; playback
stretches them to fit the state's real duration, so a 0.62 s hitstun and a 0.9 s guard break
play the same six poses at different speeds. Only the cues decide what cuts in with no
blend.

| Clip | Frames 01–06 (cues) | Holds | Pose recipe |
|---|---|---|---|
| `idle` | neutral ×6 | 4,5,3,3,5,5 | Breath only: torso ±1.6°, root ±1.5 px, weapon ±2.5°. A weight shift from the rear foot to the front and back. Never a symmetrical bob. |
| `move` | neutral ×6 | 4,5,3,3,5,5 | A walk with a real stride: legs open 22°, arms counter-swing, weapon held quiet while the body works. |
| `block` | neutral ×6 | 4,5,3,3,5,5 | Sword vertical before the face, both hands on the hilt, elbows in. Frames 02–04 widen by a hand's breadth and tighten again — the guard *reads* the incoming line. |
| `crouch` | neutral ×6 | 4,5,3,3,5,5 | Down onto the rear foot over three frames, settle, hold low. Knee forward, weapon low and level. |
| `dodge` | neutral ×6 | 4,5,3,3,5,5 | A passing step to the left with the torso turning 30° and the weapon held across — the body leaves the line, the feet never leave the floor. |
| `switch` | neutral ×6 | 4,5,3,3,5,5 | The weapon swung down and out in an arc across the body, as if changing hands: a flourish, 6 frames, ends where it began. |
| `hitstun` | contact, recovery ×5 | 4,5,3,3,5,5 | Any hit, no zone known: torso back 30°, root back 11 px, arms flung, head lagging. |
| `hitstun_head` | contact, recovery ×5 | 4,5,3,3,5,5 | The head takes it: torso back 38°, the head snapping *later* than the torso, one arm up, weapon down. |
| `hitstun_torso` | contact, recovery ×5 | 4,5,3,3,5,5 | The body takes it: the chest folds, the arms cross inward, the feet stay planted. |
| `hitstun_legs` | contact, recovery ×5 | 4,5,3,3,5,5 | The legs take it: from the crouch, the body pitches down and forward and the rear knee buckles. |
| `guardbreak` | contact, contact, recovery ×4 | 4,5,3,3,5,5 | The guard opens and cannot close: both arms flung wide, the weapon out of the line, the chest presented, the head back. Two contact frames — this is the loudest pose a fighter owns. |
| `dead` | contact, recovery ×5 | 4,5,3,3,5,5 | Falls *backwards* from the blow and lands folded: hips under, one knee up, weapon dropped out of the hand, head on the ground. The last frame holds. |

### 7.2 The three attacks

Zone is the **hit height**, and it is the only thing that distinguishes them. Each is six
frames: `01` return from the guard, `02` anticipation (the weapon high or cocked, the chest
turned *away* from the target), `03` contact (the full extension, blade and arm in one line,
the body's mass forward), `04` overshoot (the weapon past the target, the rear heel up, the
body still travelling), `05` recovery (gathering back, weight returning), `06` neutral.

| Clip pattern | Cue | Zone | Pose |
|---|---|---|---|
| `<prefix>_light` | torso | torso | A cut across the middle: from a low guard, the blade rises 30° and travels horizontally through the target's ribs. Fast, wide, not deep. |
| `<prefix>_heavy` | head | head | The overhead: a full raise over the shoulder (frame 02 must be *tall*), then a diagonal cut down through the head, ending with the blade at the opponent's far hip. |
| `<prefix>_low` | legs | legs | The low cut: from the crouch, a horizontal sweep at the shins, the body folded over the front knee. |

Meyer's kit prefixes: `ls_` (longsword), `ds_` (dussack), `cl_` (cudgel), `sp_` (spear).
Opponent clips are named whole: `thug_overhead`, `thug_body`, `thug_low`, `spear_thrust`,
`captain_cut`, `captain_bash`, `wretch_claw`, `boss_sweep`, `boss_leap`, `boss_shock` —
keep the existing ids so nothing in the sim has to move.

**One kit is the exception to this, and it is the one this pass is about.** The longsword
already owns nine attacks, and they are already wired into input resolution in
`src/sim/attacks.ts`: a light chain (`ls_l1` → `ls_l2` → `ls_l3`), a committed heavy
(`ls_h`), and the dodge, low, air and switch-entry movements. Two of them are not standard
attacks at all — `ls_h` and `ls_counter` are the first and third beats of the invitation
combo (§8.1) — so they are drawn in §8 and the other seven keep the standard idiom here.

---

## 8. The three combos — Meyer, longsword

Three combos, and the whole point is that **they do not read alike**. One is stillness and
then an explosion. One is a wheel. One is a pair of scissors. In order of how hard they are
to sell: the wheel first (§8.2) because nothing else in the game turns, the scissors second
(§8.3) because nothing else crosses the hands, and the invitation third (§8.1) because it is
mostly acting.

Provenance labels follow `docs/HISTORICAL_METHOD.md`. All three are **Documented** as cuts
in Meyer's own book and **Adapted** in their timing, crowd value and frame count.

### 8.1 Provoke → Take → Hit — the invitation, then the answer

*Function:* the duel's core loop, and the only combo that starts with the player doing
nothing. Beat 1 offers the opening and sets the sim's `provokeTimer`; beat 2 is the *take* —
the parry or a deflecting cut, which is the `parryWindow` and the `deflectStart/End` window
on his own second cut; beat 3 spends the opening (`openingTimer`, 1.52× damage, 1.78× with
the longsword and the provoker lesson). Three clips, and **all three already exist** — this
is an art rework, not a new move.

#### `ls_h` — Committed Hew (the provoke). 6 frames, cues neutral/anticipation/contact/overshoot/recovery/neutral, holds 4,5,3,3,5,5.

| # | Cue | Pose | The read |
|---|---|---|---|
| 01 | neutral | Guard at the right shoulder: sword cocked back above the right shoulder, point up and back, left hand forward and open, weight even, chin down. | Ready. |
| 02 | anticipation | Full overhead: both hands high above the right temple, point back and low behind him, chest turned away, front knee loaded. | **The telegraph.** This frame is the promise; it must be readable for the sim's 0.26 s of startup. It is the tallest pose he owns. |
| 03 | contact | The cut arrives **on the other man's weapon, not his body**: hands at chest height, edge down and to his left, blade stopping dead against steel, front foot planted, torso already rotated through. | *Steel on steel.* Deliberately different from every other contact frame: the blade's line is stopped, not continued. |
| 04 | overshoot | The follow-through runs on past the bind, and he also takes a **half-step back** with the rear foot: blade out to the right, point low, torso rocking back. | He has cut and stepped out of measure. |
| 05 | recovery | **The invitation.** The point comes up and out to his right at shoulder height, held clear of the line; the left shoulder turns forward and the chest opens; the head comes up; both knees soft. | *Come and take it.* The torso is presented and the sword is deliberately out of the way. |
| 06 | neutral | Settled in that same open high guard, point up-right, breathing. | Still inviting. |

```text
PROMPT — ls_h (Meyer, longsword, committed hew)
Six figures, left to right, one shared floor line:
1 stance, sword cocked above the right shoulder, point up and back, weight even.
2 full overhead swing, both hands high above the right temple, point back and low,
  chest turned away, front knee loaded — the tallest, widest telegraph pose.
3 the cut stopping dead against an unseen opponent's blade at chest height, edge
  down-left, front foot planted, torso rotated through, the blade's motion halted.
4 the follow-through past that bind, blade out to the right and point low, rear foot
  stepped back, torso rocking back, weight leaving the front foot.
5 the point lifted up and out to his right at shoulder height, clear of the line, the
  left shoulder turned forward, chest open, chin up, knees soft — an open invitation.
6 settled in that same open high guard, point up-right, breathing.
```

#### `block` — the take (the parry). 6 frames, neutral cues, holds 4,5,3,3,5,5.

The guard clip plays for a *held* guard **and** for the timed parry, so its middle frames
are the take. Nothing in the sim changes; only the art gets a parry in it.

| # | Pose | The read |
|---|---|---|
| 01 | Sword vertical before the right cheek, both hands on the hilt, elbows tight, weight even. | Guard shut. |
| 02 | The guard opens a hand's breadth to his left; the point lifts; he is reading the incoming line. | Guard loose — *an invite in itself*, deliberately the same shape as §8.1 frame 05. |
| 03 | **The take.** His hands cross to his left and the hilt comes up above his head, so his blade arrives **from outside onto the other man's blade**, edge on edge, and the enemy's line is visibly turned away. | *His cut went somewhere else.* The crossed-hands shape is the signature; nothing else in the kit crosses the hands except §8.3. |
| 04 | The diverted blade is carried outward past his right shoulder, shoulders rotating slightly away, the weight on the rear foot. | The enemy's cut has passed. |
| 05 | Returning toward the vertical guard, weight coming back even. | Gathering. |
| 06 | Guard, as 01. | Guard shut again. |

#### `ls_counter` — Master Cut (the hit). 6 frames, neutral/anticipation/contact/overshoot/recovery/neutral, holds 4,5,3,3,5,5.

The payoff, and the numbers say so: 27 damage, 0.62 s hitstun, and the biggest knockback in
his kit. Its startup is **0.07 s** — the shortest he owns — so the anticipation frame must be
taught, not long: *a short, tight wind and then everything.*

| # | Cue | Pose | The read |
|---|---|---|---|
| 01 | neutral | From the guard, chest turned half away, blade across the body. | Loaded. |
| 02 | anticipation | A short wind: hands up at the right temple, blade almost flat along his arm, elbows pulled in, weight dropping to the rear foot. | *Short and tight* — this frame must not look like the big overhead, or the two clips merge in the player's eye. |
| 03 | contact | The full diagonal: a cut from his upper right through the opponent's left hip, onto a deep lunge on the front foot, **both arms extended, blade and both arms in one straight line**, body low, chin down. | The longest, widest silhouette he owns. This is the money frame. |
| 04 | overshoot | Blade carried past the hip, point at the ground behind the opponent's knee, weight fully forward, rear heel up off the floor (the heel lifts, the toe stays). | Everything has gone into it. |
| 05 | recovery | Gathering the blade back up the same line, stepping the rear foot through. | Coming back to measure. |
| 06 | neutral | Guard. | Done. |

### 8.2 The Twerchcopter — the wheel

*Function:* the only move in the game that **hits behind him**. A planted horizontal spin
with two cuts per revolution, radial, several targets, small knockback per cut and a large
total — the answer to being surrounded, and the answer to an enemy that has read a straight
line. The **Twerchhau** (thwart/cross hew) is Documented; the full revolution is Adapted for
crowd work and LF2's own spinning attacks.

#### `ls_twerch` — 6 frames, cues neutral/anticipation/**contact**/**overshoot**/contact/neutral, holds 4,5,3,3,5,5.

Two contact frames, and that is deliberate: the cue model uses `contact` to cut in with no
blend, and both cuts need that. `arc` in the sim is `radial`.

| # | Cue | Pose | The read |
|---|---|---|---|
| 01 | neutral | Low wide stance, side-on: sword carried horizontally across the body at waist height, point at the enemy's face, left hand on the pommel (two hands, not one), hips closed, knees bent. | Coiled. |
| 02 | anticipation | The coil tightens: torso winds to his own left, both arms pull the hilt across to the left hip, blade horizontal, back knee loaded, shoulders already turning ahead of the hips. | *It is going to go round.* |
| 03 | **contact** | **The first twerch**: a flat horizontal cut straight across the front at chest height. Sword and both arms form **one horizontal line with the shoulders**, torso nearly side-on to the camera, hips leading the shoulders, front foot pivoting on its heel, rear foot flat. | The widest, flattest pose in the game. |
| 04 | overshoot | The turn has carried him so the figure is **turned away from the camera**: shoulders foreshortened so the body visibly shortens, head turned back over the shoulder toward the enemy, sword still horizontal, hips a quarter-turn past the feet, front heel up. | **The frame that makes it a spin.** If the figure does not turn here, it is just two cuts. |
| 05 | **contact** | **The second twerch**, arriving as he comes round to face the enemy again: now at neck height and rising slightly, arms back out into a horizontal line, the cut travelling the other way. | The wheel closes. |
| 06 | neutral | He has completed the revolution and stands exactly as frame 01 — blade across the body, coiled, ready for another. | Loops into a second revolution without a pop. |

```text
PROMPT — ls_twerch (Meyer, longsword, "Twerchcopter")
Six figures, left to right, one shared floor line, feet never leaving the floor:
1 low wide side-on stance, sword carried horizontally at waist height, point at the
  opponent's face, both hands on the hilt, knees bent.
2 the coil: torso wound to his left, both arms pulling the hilt across to the left
  hip, blade horizontal, back knee loaded, shoulders turned ahead of the hips.
3 the first horizontal cross-cut at chest height, sword and both arms in one
  horizontal line with the shoulders, torso nearly side-on, hips leading.
4 the same spin a quarter further round: the figure turned AWAY from the camera and
  visibly foreshortened, head turned back over the shoulder, sword still horizontal,
  hips a quarter-turn past the feet, front heel up.
5 the second horizontal cut as he comes round again, now at neck height and rising,
  arms back out in one horizontal line, the cut travelling the other way.
6 the same coiled stance as the first figure, blade across the body, ready to go
  round again.
```

**Constraint, stated once and for the whole combo: the spin is a planted pivot.** The feet
stay on the floor line in every frame — the validator holds ground drift to 1 px and the
renderer adds height in code. The turn is in the hips, the shoulders and the heel; the
figure's width is the cheat that sells it.

Optional upgrade clip, if the wheel gets a lesson (mirrors `ls-threefold`): **`ls_twerch_copter`**,
6 frames, a *third* revolution with the blade a hand higher each pass, ending with the sword
overhead — the copter taking off. Two contact frames again, the second at head height.

### 8.3 Krumphau → Schielhau — the scissors

*Function:* the pair that beats the two things a straight cut cannot: a shut guard, and a
thrust. **Krumphau** (crooked hew) breaks the guard — high guard damage, hits the hands.
**Schielhau** (squinting hew) breaks the long point — it beats a thrust and then hits the
man who made it. Both are Documented ("Krumphau bricht die Hut", "Schielhau bricht den
langen Ort"); the timing is Adapted.

They are drawn as one shape read in two directions: **Krumphau goes down and across,
Schielhau goes up and across, both with the hands crossed.** A player should be able to tell
which one is happening with the sound off.

#### `ls_krumphau` — 6 frames, neutral/anticipation/contact/overshoot/recovery/neutral, holds 4,5,3,3,5,5.

| # | Cue | Pose | The read |
|---|---|---|---|
| 01 | neutral | High guard, right: sword high and out to his right, point forward and slightly up, weight even, eyes on the opponent's hands. | Guarded high. |
| 02 | anticipation | **The hands cross**: left hand low, right hand high on the hilt, the arms making an X in front of the chest, blade slanted back up over his left shoulder, weight on the rear foot, chin down. | A shape nobody else in the game makes. |
| 03 | contact | The cut drives **down and across** with the hands still crossed: the edge strikes down onto the opponent's hilt and hands at waist height, both arms extended down-left, body folded forward over the front knee. | *He cut at the hands, not the man.* |
| 04 | overshoot | The hands uncross through the follow-through, blade continuing down past his own left hip, point at the ground, torso pitched forward, rear leg trailing. | The most unbalanced pose he owns — deliberately. |
| 05 | recovery | Rising, gathering the blade back to the right, hands still low. | Straightening up. |
| 06 | neutral | Low guard, point at the opponent's knee. | Guarded low. |

#### `ls_schielhau` — 6 frames, neutral/anticipation/contact/overshoot/recovery/neutral, holds 4,5,3,3,5,5.

| # | Cue | Pose | The read |
|---|---|---|---|
| 01 | neutral | From the low guard, point toward the opponent's face — the blade already threatening the line the thrust will come down. | Waiting on the thrust. |
| 02 | anticipation | He **steps off the line** (a half-step to his right) and pulls the hilt up past his left cheek: blade slanting forward to the opponent's face, hands crossed (right hand high, thumb up, short edge leading), body turned so the thrust's line passes his flank. | He is not blocking the thrust — he is standing where it is not. |
| 03 | contact | The short edge drops onto the incoming point: blade nearly vertical, cutting **down the enemy's line**, hands crossed at the chin, shoulders over the cut, weight on the front foot. | *The thrust is beaten aside.* Again: steel, not body. |
| 04 | overshoot | The same cut runs **through** the beaten thrust and onto the opponent's head and arm: the blade now diagonal across his upper body, both arms extended, a full forward step taken, the figure's whole mass forward, rear heel up. | The answer. This frame must be unmistakably a body hit — the only one in the pair. |
| 05 | recovery | Gathering back, blade up to the right, weight returning to the rear foot. | Coming off him. |
| 06 | neutral | High guard. | Done. |

---

## 9. Batch order

Each batch is a session's work, and each one is reviewed at phone scale in motion before the
next starts. Sizes are the delivered strip sizes; the extracted frames are always
384 × 384.

| # | Batch | Units | Why here |
|---|---|---|---|
| 0 | **Style proof** — Meyer `idle`, 6 frames | 1 strip (2400 × 400) | Calibration. If the line, the palette and the face do not read at 127 px, nothing after this is worth generating. Change the medium here, not later. |
| 1 | **Meyer longsword states** | 12 clips (nine states + three zone reactions) | The base everything is compared against. Also generates the idle/move/hurt poses the other batches will be repainted from. |
| 2 | **The three combos** | 6 clips — `ls_h`, `block`, `ls_counter` reworked, `ls_twerch`, `ls_krumphau`, `ls_schielhau` new — plus the optional `ls_twerch_copter` | The request of this pass, and the reason for the whole overhaul. Do the wheel first (§8.2). |
| 3 | **Meyer, longsword, remaining attacks** | 7 strips: `ls_l1`, `ls_l2`, `ls_l3`, `ls_dodge_l`, `ls_low_l`, `ls_air_l`, `ls_switch_in` | The standard idiom (§7.2), so the kit is complete and the combos have a surrounding grammar. |
| 4 | **Meyer's other kits** — dussack, cudgel, spear | dussack 21 clips, cudgel 16, spear 15 (12 states each + that kit's attacks) | Route B: repaint batch 1 and 3's strips with a different weapon in hand. |
| 5 | **Opponents** | thug 11+3, spear 7+1, captain 9+2, wretch 7+1, grotesque 7+3 | Same route: repaint the standard strips in each actor's costume. |
| 6 | **The road** | 5 tiles + 3 fixture sprites | Needs the one added renderer layer (§3.1). |
| 7 | **The four hangings** | 4 × 1920 × 1080 + 2 corruption overlays | The largest single images, and the least urgent: the game reads fine on the current backdrops. |
| 8 | **Items** | 6 small atlases | Last, because it is a renderer change as well (§5.2). |

### Acceptance per clip

1. Flattened to black, the six figures are still legible (§6.2).
2. `validate-fixed-rig-art-v2.py` passes: canvas 384 × 384, anchor (192, 350), ground drift
   ≤ 1 px, nothing cropped.
3. `audit-animation-scale.py` reports no clip whose apparent size drifts from the idle's.
4. The cues and holds in `clip.json` match the manifest, and every clip is six frames —
   `tests/fixed-rig-v2.test.mjs` will tell you. **Its pinned counts (124 clips; meyer 73,
   thug 14, spear 8, captain 11, wretch 8, grotesque 10) move when this pass adds clips**,
   so update them in the same commit as the art.
5. The strip is watched in motion at phone scale, next to the clip it replaces, and next to
   its neighbours in the combo — the combo has to read as a *sequence*, not as three good
   poses.

---

## 10. Decisions this brief has taken, and what they cost

**The medium is printed line art.** The alternative — a painted, illuminated look — is the
one thing that would invalidate every pose recipe here, because it changes what a contact
frame *is*: in a painted treatment the read has to come from lighting and silhouette rather
than from a contour and a hatch. Switching later is a full redo, so this is the decision to
argue with first.

**The combo clips are reworks, not new moves.** `ls_h`, `block` and `ls_counter` already
carry the provoke/take/hit mechanics in the sim; the art is being taught to show what the
code already does. The two new devices — the Twerchcopter and the Krumphau–Schielhau pair —
are new *clips* whose attack ids would be added to `ATTACKS` and `MEYER_ATTACKS` when they
are wired. Until then they are art with a folder name, which is exactly what this pass is
for.

**The road gets its own layer.** That is a renderer change (a tile loop and one draw order
move), taken because the current build slides the ground under the fighters at 35 % of their
speed. If the road stays baked into the backdrops, the parallax cheat stays too, and the road
art has to stay soft.

**The backdrop moves to 1920 × 1080 drawn 1:1.** Today's source is 1280 × 720 stretched into
1920 × 1104 — a 2.2 % vertical stretch and a 1.5× upscale, both of which a woven texture will
expose immediately.

**Six frames per clip is a test-enforced ceiling.** It is kept, and the wheel is authored as
a *planted pivot* rather than a longer airborne spin. If a ten-frame revolution is wanted
later, `tests/fixed-rig-v2.test.mjs` and the cue model both need loosening first.

**The rig stops being the only producer.** `docs/ARCHITECTURE.md` currently states that
`generate-fixed-rig-art-v2.py` is the only art producer, and it is that determinism which
makes a committed `manifest-v2.json` safe. From batch 0 onward, art arrives from a model and
is normalized instead of reproduced — so the rig's role narrows to what it is genuinely best
for: blocking a pose and giving the validator landmarks, proportions and an anchor to hold
against. The manifest keeps its checksums (they are per-file digests, not a rebuild proof),
but `--verify-rebuild` stops meaning what it says and should be retired or renamed in the
same pass.

**What this brief does not cover:** hit effects, sparks, impact marks, weapon trails, screen
shake and floating text (all drawn in code and already distinct per event), the DOM UI, the
codex illustrations, and portraits. The infernal corruption is covered only as a backdrop
overlay.
