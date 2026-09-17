Independent verdict: the game is technically code-drawn, but the screenshots do not yet meet the visual or phone-use bar. The phone layout is a shrunken desktop arena; fighters read as toy-like articulated mannequins; buildings read as repeated flat facades.

1. P0 — Portrait combat field is far too small

At 390×844 CSS pixels, [`site/styles.css`](site/styles.css:54) constrains the canvas to 16:9, so the arena is only about 390×219px and centered between large empty regions. [`canvas-renderer.ts`](src/render/canvas-renderer.ts:135) also hard-codes a 1280×720 world. The screenshot shows fighters only roughly 50px tall.

Correction: use a portrait camera/aspect ratio with a taller road view, or enforce landscape with a real blocking rotate prompt. The existing `.rotate-overlay` CSS has no corresponding element in `index.html`; “LANDSCAPE RECOMMENDED” is only passive text.

Acceptance: at 390×844, the active arena is at least 320px tall and a normal fighter is at least 72px tall, with no more than 48px of dead space between the arena and controls.

2. P0 — Action hit areas overlap

The 390px layout places SWAP directly over the center of STEP, CUT, FINISH, and especially GUARD. [`styles.css`](site/styles.css:1496) gives SWAP and the attack row the same `top: 42%`; the compact override further compresses the cluster at lines 1880–1884. The screenshot visibly shows SWAP sitting on top of GUARD.

[`touch.ts`](src/input/touch.ts:72) attaches independent native pointer handlers and has no overlap arbitration. A touch in the shared region can therefore trigger the visually topmost button instead of the intended action.

Correction: redesign the cluster as non-overlapping circles, or move SWAP to a separate item/context position.

Acceptance: at 390×844, pairwise control hit regions have zero intersection and at least 8px clearance; SWAP cannot intercept GUARD; stick + attack remains usable simultaneously.

3. P1 — Bodies read more like toy robots than articulated humans

The rig is technically jointed, but the final silhouette is dominated by uniform-width polylines, oversized dark outlines, circular elbows, and a small polygonal torso. See [`canvas-renderer.ts`](src/render/canvas-renderer.ts:387), especially `drawTailoredBody`, `drawLimb`, and `drawBoot` around lines 408–489 and 722–771. At screenshot scale, clothing, shoulders, hips, knees, and hands collapse into colored bars and knobs.

Correction: replace stroke limbs with tapered clothing/skin shapes, occlude joints naturally, add articulated shoulders/hips, hand wraps around the hilt, garment folds, and weight-bearing feet.

Acceptance: in 390px captures of idle, attack, guard, and dodge, the head, shoulders, elbows, hands, hips, knees, and ankles remain distinct; no joint circle is wider than the adjoining limb; both hands visibly meet the weapon.

4. P1 — Fencing motion is generic rather than historically legible

[`procedural-rig.ts`](src/render/procedural-rig.ts:237) maps attacks to a small set of generic angles, including a hash fallback. [`poseForActor`](...:419) uses mostly fixed grip, shoulder, hip, and foot coordinates. This can produce movement, but not clearly different Meyer-style guards, chambers, cuts, or thrusts.

Correction: author weapon-specific silhouettes for longsword, dussack, spear, and the key routes: cut, finish, step-cut, guard-direction-cut, and parry response. Preserve LF2’s fast anticipation/contact/recovery rhythm, but give each move a distinct body line and weight transfer.

Acceptance: the five primary routes have visibly different contact poses; the blade, hands, hips, and front foot agree in every contact frame; a viewer can identify the attack direction without relying on the button label.

5. P1 — Architecture is a tiled backdrop, not a convincing town

[`procedural-scene.ts`](src/render/procedural-scene.ts:337) repeatedly draws the same house recipe: rectangular facade, roof, two or three windows, horizontal rail, and banner. `drawCobblePerspective` at line 561 supplies useful road convergence, but the building layer has little occlusion, cast shadow, material variation, or depth separation.

Correction: vary roof pitch, frontage width, window rhythm, plaster/stone/wood materials, roof overhangs, balconies, arches, signage, and foreground occluders. Add at least one additional architectural parallax layer and directional light/shadow.

Acceptance: three adjacent visible facades differ in roof, window, and material treatment; no identical house module repeats within 600px; facade edges show measurable depth through shadow or occlusion.

6. P1 — Live status text is small and duplicated on phones

At portrait sizes, `.player-line` is about 8px, vital labels about 7px, and route cues about 8.5px in [`styles.css`](site/styles.css:1303). Contrast is adequate, but the labels are not comfortable at 1× viewing. The wave title is also repeated in the topbar and the large banner.

Correction: use one compact encounter header, raise essential live text to at least 12px, increase enemy bars from their fixed 52px world width, and reserve the banner for transient events.

Acceptance: at 390×844, vitality, guard, weapon, wave, and current route are readable without zooming; enemy health bars are at least 32px wide and 5px high.

7. P1 — “Practice” is misleading

[`site/index.html`](site/index.html:40) labels the button “Practice,” but [`ui.ts`](src/ui/ui.ts:89) wires it only to `openGuide(false)`. It opens a static move guide; it does not start a training arena, spawn dummies, reset state, or provide practice feedback.

Correction: rename it “Move guide,” or implement a real practice scene.

Acceptance: clicking Practice either enters an interactive, resettable training space or the label explicitly says “Move guide.”