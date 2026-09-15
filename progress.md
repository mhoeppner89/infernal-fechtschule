Original prompt: My initial play test is okay. Animations etc. all feel very sluggish however, combos are not visually interesting. Your goal is to create the full current artwork (characters, weapons, backgrounds, that can also move etc.) and animation using a gauntlet against Little Fighter 2. Animations should feel crisp and interesting. Research best practices for fighting games to do a great job and don't stop until fighting looks and feels perfect.

# Current goal

Create and integrate a complete original art and animation pass for the existing vertical slice, then iterate through an independent builder/critic gauntlet until matched combat captures beat Little Fighter 2 on pose clarity, impact, responsiveness, and combo interest.

# Gauntlet bar

- Little Fighter 2 official overview and screenshots: https://lf2.net/en/intro.html
- Matched gameplay reference: https://www.youtube.com/watch?v=wklqGG2FrEM (clean exchange at 2:30; crowd fight at 1:33)
- Additional LF2 captures: https://www.youtube.com/watch?v=qfSiEEjocmA and https://www.youtube.com/watch?v=FfvzkO0D_tc
- Animation practice reference: Mariel Cartwright, “Fluid and Powerful Animation within Frame Restrictions”: https://www.gdcvault.com/play/1020017/Animation-Bootcamp-Fluid-and-Powerful

# Working quality rules

- Original assets only; Little Fighter 2 is a motion/readability benchmark.
- Strong readable key silhouettes at the actual phone scale.
- Player attacks get at least one brief anticipation pose without delaying accepted input.
- Each attack uses anticipation, directional smear/arc, contact key, overshoot, and decisive recovery where its timing permits.
- Key poses use intentional uneven holds; no uniformly eased limb interpolation.
- Hit, block, parry, interception, armor, and guard break must remain distinguishable without color alone.
- Every current actor, weapon, attack, movement, hurt, guard, defeat, wave setting, and infernal transition needs a complete manifest entry.

# Status

- Goal created.
- Baseline tests passed before implementation: 15/15.
- Browser baseline showed functional combat but procedural figures, uniformly interpolated weapon motion, weak pose separation, and crowded phone HUD.
- Independent research, architecture inventory, and baseline critic are complete.
- The baseline loses decisively to LF2 on crowd readability, whole-body attack posing, contact impact, and combo identity.
- Deterministic `advanceTime` and `render_game_to_text` browser hooks are integrated and smoke-tested.
- Simulation snapshots now expose movement/weapon/death fields; death timing, finite block serialization, interception events, and armor impact classification are fixed.
- The approved original Meyer seed and four-frame longsword idle are normalized in `site/assets/art/`.
- Added component-aware strip normalization so long weapons and smears are not cut by equal-width cells.
- Integrated the first four-pose Meyer attack, a typed 70-clip animation inventory/catalog, and runtime asset-readiness reporting.
- Completed and integrated all four original wave backgrounds with ambient motion and transition support.
- Approved distinct thug, spearman, captain, wretch, and Bound Grotesque seeds.
- Completed, normalized, visually inspected, and registered every current enemy clip: idle, locomotion, hitstun, defeat, captain block/guard break, and all eight enemy/boss attacks.
- Supernatural attacks now have separate silhouette families: stretched claw rake, horizontal chained-fist sweep, airborne body slam, and planted ground shock.
- Added manual pose-boundary support to the strip normalizer for capes, boots, chains, and long weapons that touch across generated cells.
- Completed, normalized, visually inspected, and registered Meyer’s full longsword kit: nine states and eleven distinct attacks.
- Approved a historically grounded steel Dussack master based on Meyer-era and museum references, then completed, normalized, visually inspected, and registered its nine states and eleven attacks.
- Added fixed 2-by-2 grid extraction to preserve prone bodies and wide smears without clipping when poses overlap horizontally.
- The full 70-clip current animation inventory now has authored assets and timing; no planned placeholders remain.
- Aligned authored anticipation, contact, and recovery keys to every attack's actual startup/active/recovery windows; accepted input is visibly acknowledged on the next 60 Hz step.
- Converted all 280 runtime frames to 384 px WebP while retaining editable PNG sources; the complete four-background runtime art payload is now practical to ship.
- Added deterministic impact marks, hit-type-specific feedback, camera response, asynchronous crowd poses, a subdued play band, and a warm player edge for melee readability.
- Shortened the slowest Dussack recovery windows. Final contact spacing is 0.30–0.45 seconds for the two quick branches and 0.45–0.48 seconds for the heavy wheel branch.
- First fresh gauntlet critic scored the build 5–4 over LF2. Its four losses (impact, rhythm, crowd readability, visual hierarchy) drove a focused second pass: compact one-beat sparks, a clean true recovery frame, fixed-HUD combo count, clearer figure separation, and faster heavy branch cadence.
- A stricter second critic scored the next evidence set 3–6 because same-depth targets still covered Meyer, the long wave banner obscured the dedicated crowd proof, and the combo sheet showed authored contact poses without live targets. That evidence correctly exposed three remaining presentation flaws.
- The local attacking player now draws last, the compact impact core draws above sprites, and authored victims receive a one-beat full-sprite flash. Meyer, the blade path, the target, and the exact contact point are all visible together.
- The benchmark longsword heavy now contacts at 0.267 seconds and returns to neutral at 0.700 seconds, down from 0.333 and 0.883 seconds; its knockback is stronger and its recovery is visibly effect-free.
- The wave announcement now holds for 600 ms instead of 2100 ms, occupies at most a translucent 520×50 px strip above the actor band, and clears before the crowd exchange.
- Re-captured all three Dussack routes against live nearby targets. Every contact now has measured health loss, hitstun/death, visible feedback, and increasing combo counts: A 1→2→4, B 1→3→5, C 1→3→4.
- Signature move labels are emitted once per attack and expire before the next contact, removing stacked callout text from branching combos.
- The decisive fresh gauntlet critic passed the final build 7–2 over real LF2 footage. The candidate won pose clarity, impact, one-frame responsiveness, combo identity, visual hierarchy, mobile readability, and original-art completeness; LF2 retained rhythm/crispness and dense-crowd separation.
- Final browser evidence loads 70/70 clips, 280/280 frames, and 4/4 backgrounds with no asset or console failures at desktop and 844×390 phone landscape sizes.
- Final deterministic performance probe rendered 60 crowd frames in 4.99 ms in headless Chromium's software-rendered test.
- Final build and all 15 automated tests pass; the prescribed web-game smoke client also reports the complete asset set and no console errors.

# Next

- Goal complete. Optional future polish can focus on breaking up extreme same-costume crowd piles and tightening the two longest heavy-branch gaps without changing the accepted combat cadence.

# Follow-up: animation scale normalization

- Root cause: every generated strip used one internally consistent scale, but each strip chose that scale independently. Long weapons and wide smears therefore made some complete moves render much smaller than idle and movement.
- Added runtime body-scale calibration for every ready clip. Idle frames define the target per archetype; bright neutral blades and motion arcs are excluded from the body measurement.
- Corrections stay shared across all four frames of a clip so crouches, leaps, and prone poses keep their intended proportions. A fuller-pose upper quartile prevents compact poses from inflating an entire move.
- Added `tools/audit-animation-scale.py`, including invalid-frame detection, within-clip outlier reporting, and grouped four-frame comparison sheets.
- Repaired the malformed Meyer dussack dodge source: the original extraction merged its last two figures and produced a transparent fourth runtime frame. It now has four visible, bottom-anchored poses and a clean return to guard.
- Expanded the calibrated range after visual comparison. Spear thrust, wretch claw, Bound Grotesque sweep, and Meyer’s wide dussack dodge attack now match their respective neutral body sizes instead of shrinking around their weapon reach.
- Final asset report: 70/70 clips normalized, 280/280 runtime frames loaded, 0 pending, 0 failed, and no browser console errors.
- Live crowd capture confirms thug movement/overhead attack scale and Meyer hitstun scale remain stable together. The offline contact sheets confirm the same for spearman, captain, wretch, Bound Grotesque, longsword Meyer, and dussack Meyer.

# Next

- Follow-up complete. Final prescribed smoke screenshots show stable idle/movement scale, 70/70 normalized clips, and no console errors. The final build and all 15 automated tests pass.

# Local test build on port 4174

- Requested a current local test version at `http://localhost:4174/` with an end-to-end smoke check.
- Found port 4174 serving an older installed Infernal Fechtschule copy from `~/Library/Application Support/InfernalFechtschule/app`; it predates the completed art pass.
- Rebuilt the current workspace and ran the packaged regression suite: 15/15 tests pass.

# Next

- Local test build complete and live at `http://localhost:4174/`. The dedicated stale `fechtschule-serve` launch service was stopped for this session and replaced by the current workspace server.
- Prescribed browser smoke: movement changes position, weapon switching completes in both directions, 70/70 clips and 280/280 frames load, all four backgrounds load, and no console error file is produced.
- Live combat proof: longsword heavy enters anticipation, contacts a nearby thug, reduces health from 28 to 6, records the combo, shows readable hit feedback, and returns to neutral.
- UI proof: title boot, production-art marker, pause overlay, resume flow, desktop HUD, and 844×390 phone landscape layout all pass. Phone layout is exactly 844×390 with no document overflow; touch controls are visible and the rotate prompt remains hidden.
- Final server liveness check confirms the current production-art page is still served by the workspace Node process on port 4174.
- Automated regression suite remains 15/15 passing; browser and page error lists are empty.

# Next

- None for this local test deployment. Keep the workspace server session running while the user tests at port 4174.

# Active goal: smooth animation and simplified graphic style

- New persistent objective: smooth animations for every character and state (walking, fighting, combos, hurt/death/etc.) with one clean simplified graphic style.
- Parallel work started: one worker owns runtime animation smoothing, one owns a deterministic shared-palette art stylizer and preview evidence, and one explorer is auditing full manifest/state coverage and acceptance criteria.
- Captured an authoritative 60 Hz baseline from the live 4174 build. Movement visibly holds the same authored pose for several consecutive frames before popping to the next; the heavy attack likewise changes only at its four key poses. Baseline sheets are `/private/tmp/fechtschule-motion-before/move-sheet.png` and `/private/tmp/fechtschule-motion-before/heavy-sheet.png`.
- The audit found a simulation bug that left every NPC movement clock at zero, so all moving thugs, spearmen, captains, wretches, and the boss displayed only locomotion frame one. Player idle-to-move changes could also inherit an unrelated clock phase.
- Fixed continuous idle/move state clocks for the player, every standard enemy, and the boss. Clocks now reset on state entry and advance on subsequent simulation steps; a focused regression covers both player and NPC movement.
- Added short pose-to-pose presentation transitions that keep contact frames immediate, never trail a contact silhouette, and soften loop/state changes without adding input latency. Explicit clip overrides correct the remaining spear-thrust and dussack-dodge body scale outliers.
- Added buffered co-op guest presentation: 20 Hz authoritative snapshots now interpolate positions at render rate, loop animation clocks advance locally, stale packets cannot rewind motion, and attacks/reactions never extrapolate ahead of host timing.
- Rejected two muddy simplification previews. Approved V3 after full-resolution comparison: one stable 16-color palette per actor preserves red/gold/purple identity accents and neutral steel, while the shared background treatment lowers saturation and detail competition.
- The V3 source audit correctly blocks shipping on two inherited defects: clipped Meyer longsword idle margins and detached captain guardbreak sword fragments. Focused repair and authored attack-recovery tracks are active before the approved style is applied.

# Next

- Integrate and judge runtime transition work against the captured baseline.
- Add distinct overshoot/settle artwork so long attack recoveries no longer freeze on one pose.
- Repair the clipped Meyer idle and captain guardbreak fragments, then apply the approved V3 style to every runtime frame and all four backgrounds.
- Rebuild the 4174 server and verify representative locomotion, attacks, combo chains, hurt/death states, and responsive layouts.

# Deterministic animation QA gallery

- Added a development-only gallery at `/animation-gallery.html`. It loads the compiled manifest/catalog, draws all four numbered poses at the game’s exact 844×390 phone-height scale, reports the selected clip/frame/cue/scale correction and asset failures, and exposes deterministic 60 Hz stepping plus playback.
- Added `tools/animation-gallery-probe.mjs`. The probe selected all 70 ready clips, exercised all 280 poses and every cue, verified 280/280 image loads, checked all 17 loop wraps, and proved all 30 attack contact poses remain inside their active windows.
- Browser QA passed with no console, page, response, request, or asset failures. Evidence and the machine-readable report are in `/private/tmp/infernal-animation-gallery/`; seven 1440×1000 desktop group captures and seven exact 844×390 phone captures were visually inspected.

# Smooth animation and simplified style: final integration

- Added 98 deterministic overshoot and recovery frames across all 30 attacks. Runtime animation coverage is now 70 clips and 378 poses; long recoveries use 3–9 timed poses with no authored hold longer than 120 ms.
- Repaired the detached captain guardbreak fragment and normalized all four Meyer longsword idle frames with safe margins and a compensated ground offset.
- Applied the approved V3 style to all 378 runtime sprite WebPs and all four backgrounds. Each actor uses one shared 16-color palette; backgrounds use a quieter 48-color treatment. Alpha, bounds, dimensions, anchors, and the repaired defects were preserved.
- Independent candidate regeneration produced identical checksums, and production matches the approved candidate for all 382 shipped WebPs.
- Final scale audit covered all 378 poses and all archetypes. Every clip uses one shared body-scale correction across its frames; the repaired spear thrust and dussack dodge outliers use explicit runtime corrections. Grouped scale sheets were visually inspected.
- Final live impact proof shows anticipation, immediate contact flash, victim recoil, multi-pose recovery, and return to neutral. A live three-hit dussack pressing route reached all three distinct contact poses and labels with no browser errors.
- Final desktop and exact 844×390 phone combat captures pass. HUD, touch controls, playfield, player priority, effects, and recovery remain readable at phone scale.
- The final animation gallery visited all 70 clips and all 378 poses, including anticipation, contact, overshoot, recovery, and neutral cues. All 17 loops and 30 attacks pass; 14 desktop/phone group captures have zero browser or asset errors.
- Final 60 Hz motion capture increases the heavy attack's active visual transitions from 24 to 26 while lowering its maximum frame-difference jerk from 17.00 to 15.30. Locomotion retains 14 active transitions while lowering maximum jerk from 19.57 to 16.39.
- Integrated production build and regression suite pass: 21/21 tests, 411 service-worker precache entries, 378/378 animation assets, and 4/4 backgrounds loaded with no pending or failed assets.

# Next

- None for this goal. The current workspace build is live at `http://localhost:4174/` for local playtesting.

# Active goal: three-zone Meyer-versus-thug slice

- Locked the vertical slice to Meyer and the club thug. Other enemies and backgrounds stay unchanged.
- Added deterministic `head`, `torso`, and `legs` hit zones to attacks, hit events, reactions, and snapshots.
- Neutral Duck now enters a 0.48-second crouch. Duck followed quickly by Light or Heavy selects a weapon-specific leg attack; direction + Duck remains the existing dodge.
- Head attacks miss crouching targets while torso and leg attacks remain exposed. The thug now chooses deterministic overhead, body, and low attacks and avoids overheads against a crouching player.
- Touch and keyboard press edges are latched so very short Duck-to-attack sequences survive between render samples. The touch UI, network protocol, guest interpolation, and debug text understand crouch and reaction zones.
- Completed a deterministic fixed-scale Meyer/thug rig: 64 clips and 384 authored frames on one 384×384 canvas, one root scale, one `[192,350]` foot anchor, and separate longsword, dussack, and club source definitions.
- The clean rebuild validator matched all 384 checksums, found zero-pixel ground drift, at least eight pixels of safe transparent margin, and no scale override or asset error.
- Replaced every active Meyer and thug runtime clip with v2 art. The catalog forces correction `1.0` for this fixed-rig set and routes head, torso, and leg hits to separate reactions while retaining generic reactions for the untouched NPCs.
- An independent integration audit found and closed tiny-stick dodge drift, hit-stop edge loss, Duck/Attack ordering, Duck-axis races, low-attack head exposure, stale reaction zones, and one non-finite co-op snapshot path. Snapshot and peer protocol versions are now `2`.
- Final build and regression suite pass: 41/41 tests, 89/89 clips, 528/528 frames loaded, four backgrounds loaded, zero pending or failed assets, and 870 valid service-worker entries.
- Browser acceptance passed at 1280×720 and exact 844×390: overhead misses crouch, torso connects, Duck→Light connects low, and direction+Duck dodges. All eight state proofs and both focused reports have zero console, page, request, or asset errors.
- The current workspace build remains live at `http://localhost:4174/`.

# Next

- None for this goal. Continue with user playtesting of Meyer versus the club thug before extending the fixed-rig pipeline to the remaining NPCs.

# Local test build on port 4174 (playtest refresh)

- Rebuilt the workspace (1139 precache entries) and re-ran the regression suite: 41/41 tests pass.
- Synced the current `site/` build into the installed app copy at
  `~/Library/Application Support/InfernalFechtschule/app` (previous copy kept as
  `site.prev-20260914-234252`), then reloaded the `com.infernal-fechtschule.serve`
  launchd service so the durable port-4174 server now serves the current build
  including the per-zone reactions.
- End-to-end verification against the live launchd-served server: 56/56 checks
  pass (gallery readiness 101 clips / 606 frames, all fifteen NPC zone-clip
  resolutions, pixel-distinctness proofs, deterministic three-zone combat hits).
- The game is registered in the thread Preview tab at `http://localhost:4174/`.

# Next

- None for this deployment. The launchd service keeps port 4174 alive across
  sessions; workspace source remains the canonical copy.

# Active goal: per-zone authored reactions for the full cast

- Closed the documented follow-up: per-zone authored reactions extended from the
  Meyer/thug pilot to the spearman, captain, wretch, and Bound Grotesque.
- The fixed-rig generator already drew `hitstun_head`, `hitstun_torso`, and
  `hitstun_legs` poses for every actor; only the thug declared them. Enabled
  those states for the four remaining NPCs and regenerated the deterministic
  set: 101 clips / 606 frames (spear 8, captain 11, wretch 8, grotesque 10),
  same 384 px canvas, `[192,350]` foot anchor, root scale 1, zero ground drift,
  worst safety margin 1 px.
- `tools/validate-fixed-rig-art-v2.py --verify-rebuild` passes with a byte-
  identical deterministic rebuild (606/606 checksums).
- Registered the twelve new reaction variants for every NPC kit in the
  animation manifest and removed the thug-only gate; the generic hitstun
  remains a first-class fallback clip for every archetype. Runtime inventory:
  101 ready clips, 606 frames, 1139 service-worker precache entries.
- Updated the fixed-rig regression test: cast clip counts, per-archetype zone
  resolution for all five NPCs, generic fallback, and captain guardbreak.
- Added `tools/zone-reaction-verify.mjs`, a Playwright end-to-end check with a
  cached-Chromium fallback: gallery readiness (101 clips / 606 frames), all
  fifteen NPC zone-clip resolutions, evidence screenshots, a pixel-distinctness
  proof (head/legs reactions differ from generic hitstun on 51–93% of union
  pixels; torso shares the generic design by contract, as the thug already
  did), and a deterministic sandbox combat proof (same model as
  `three-zone-playtest.mjs`): `ls_l1`/`ls_l3`/`ls_low_l` each land on a passive
  thug, which enters hitstun with the matching reaction zone and lost health.
- Extended the generator's contact-zones preview sheet with all twelve NPC
  zone-reaction contact poses for offline visual inspection.
- Environment: the launchd service `com.infernal-fechtschule.serve` was serving
  a stale installed copy on port 4174; booted out for this session (restorable
  with `launchctl load ~/Library/LaunchAgents/com.infernal-fechtschule.serve.plist`).
  Note `tools/serve.mjs` honors `PORT`, and this shell exports `PORT=0`, so
  start it with an explicit `PORT=4174`.
- Final build and regression suite pass: 41/41 tests.

# Next

- None for this goal. The workspace build is current; start the local server
  with `PORT=4174 node tools/serve.mjs` for playtesting.

# Active goal: scrolling single-player levels (Little Fighter 2 style)

- Stages are now wide (wave definitions carry `stageWidth` 2360–2820 px, vs the
  1096 px camera window): the player expands the world by marching east while
  the camera follows, LF2 style.
- Sim-side deterministic camera (`cameraX` in the snapshot, protocol v3):
  follows the player with a soft window, clamped to stage bounds, never
  retreats mid-wave, resets at each new wave's west edge.
- Progressive spawns: group 0 appears at the wave start; later groups wait for
  the player to reach their progress threshold on the stage (with a
  field-clear fallback so there are no soft-locks), spawning around the
  player's frontier.
- Renderer: world-space translate for actors/particles/text, parallax
  background (0.35×) that can never outrun its 1920 px source art, screen-fixed
  vignette, and red LF2-style edge chevrons pointing at offscreen enemies.
- Fixed a mid-stage seam: the playfield-darkening band and the stage-bound
  rectangle were still camera-window-relative, so their edges drew a vertical
  line one screen into every stage. Both are now world-space aware (the bounds
  mark the stage's true extent and scroll away with the march; the vignette is
  screen-fixed behind the camera translate).
- Protocol bumped to v3 with camera validation; guest interpolation lerps
  cameraX. New `tests/scrolling-stage.test.mjs` (camera ratchet, gating,
  bounds clamps, player clamp) and `tools/scroll-stage-verify.mjs` (live march:
  camera follow, monotonicity, offscreen pressure, phone overflow, zero
  console errors; pixel measurements confirm the floor scrolls 1:1 and the sky
  at ~0.35× parallax).
- Final build and regression suite pass: 47/47 tests.

# Next

- None for this goal. Optional follow-up: per-stage background variety is
  already handled by wave themes; could add stage-end set-pieces (gate,
  castle approach) as visual landmarks mid-stage.

# Active goal: fixed-rig v2 art for the whole cast

- Extended the deterministic fixed-rig v2 pipeline from the Meyer/thug pilot to the spearman, captain, wretch, and Bound Grotesque.
- Added source rigs (proportions + 16-color palettes) for the four new archetypes, a spear shaft attachment, a captain sword-and-kite-shield attachment, and claw fans drawn directly from forearm joints for the crypt actors.
- The generator now renders all six archetypes from one shared pose grammar; the spearman plants his thrust instead of lunging so the long shaft keeps its safety margin.
- Generated 89 clips / 534 runtime frames: meyer 50, thug 14, spear 5, captain 8, wretch 5, grotesque 7. All frames are 384 px, bottom-anchored at [192,350], with worst safety margin 1 px and zero ground drift.
- Extended `tools/validate-fixed-rig-art-v2.py` to the full cast. The validator passes with 534/534 checksums and a deterministic rebuild producing identical hashes.
- Replaced the retired v1 enemy clip registrations in `animation-manifest.ts` with a generalized fixed-rig NPC kit loop. All 89 declared manifest clips are ready with one display spec per archetype and `fixedScale` scale correction 1.
- Added `SpriteAnimationCatalog.resolveFrameByIndex` so the QA gallery inspects each authored pose directly; the leading neutral bookend of fixed-rig attacks is intentionally unreachable in live playback and now validated as such.
- Extended the fixed-rig regression test to all six archetypes with per-actor clip counts and generic-reaction fallback checks.
- Final browser probe on the 4174 build: PASS with 89 clips, 534 poses, 36 attacks, 21 loops, zero browser errors; 7 desktop + 7 phone evidence captures.
- Final build and regression suite pass: 41/41 tests, 1055 service-worker precache entries covering the complete v2 cast.

# Next

- None for this goal. Optional follow-ups: per-zone authored reactions for the captain/spear/grotesque, and committing the accumulated workspace work.

# Active goal: denser progressive waves, combo-unlock lessons, grounded shadows

- Expanded every level from 3–5 to 7 encounter waves (2820→3820 px scroll stages) with a per-wave `pressure` scalar that scales enemy health/guard and co-op padding, so difficulty climbs smoothly within and across levels.
- Replaced post-level buff picks with a combo-unlock progression: players start with only the basic chain (ls\_l1 and the low poke) and learn the rest through lesson cards offered after waves 1 and 2. Each card lists its exact input routes (light/heavy chains, crouch entries); `isAttackUnlocked` gates every entry point, with two behavior-only lessons (guard counter, second-intention signature).
- Protocol bumped to v4 (lessons in snapshot); tests and fixtures updated. `chooseUpgrade` is now `chooseLesson` end to end.
- Fixed floating shadows: the old ellipse was a dim radial blob centered south of the feet, invisible on the dark art. The new contact shadow is a broad, near-solid LF2-style decal straddling the heel line (radius ~1.6× body, core alpha 0.74 fading at the rim, lift from `jumpOffset` for airborne states).
- New `tools/lesson-flow-verify.mjs` proves the whole loop live on :4174 (11 checks): zero starting lessons, wide stage, wave-clear opens the card overlay with route lists, picking one resumes the next wave with the lesson registered and the basic chain firing. Its grounding check re-renders the same frozen frame with `drawShadow` monkey-patched off — the pixel diff isolates the shadow exactly, asserting 1000+ darkened pixels spanning the feet line.
- Final build and regression suite pass: 47/47 tests, scroll-stage and zone-reaction probes still green against the deployed build.

# Next

- None for this goal. Optional follow-up: an additional lesson tier after the boss (dodge-cancels / air game) if the campaign grows a second act.
