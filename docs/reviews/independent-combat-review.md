Focused audit complete. I reviewed only the requested combat sources and tests; no files were modified and no browsers or servers were launched.

### Bugs

1. **Guard command leaks through weapon switching**

   `src/sim/world.ts:850-877` accepts Guard input during `switch`; `:715-724` then enters neutral without consuming it, and `:2034-2046` does not clear `guardCommand`.

   Reproduce at 60 Hz:

   ```js
   step(1/60, { switchPressed: true });
   step(1/60, { guardPressed: true, moveX: 1 });
   for (let i = 0; i < 18; i++) step(1/60, {});
   step(1/60, { lightPressed: true });
   ```

   The player enters `ds_guard_forward`, although the directional Guard command occurred during the switch and should not remain actionable.

2. **Late Duck+Cut becomes a normal high Cut**

   `src/sim/world.ts:754-774` only accepts crouch attacks through `CROUCH_ATTACK_WINDOW_SECONDS` (`:350`), but the action buffer is not cleared when that window expires or when neutral is entered (`:2034-2046`).

   At 60 Hz:

   ```js
   step(1/60, { mobilityPressed: true }); // enter crouch
   for (let i = 0; i < 21; i++) step(1/60, {});
   step(1/60, { lightPressed: true });    // outside crouch attack window
   for (let i = 0; i < 8; i++) step(1/60, {});
   step(1/60, {});
   ```

   The result is `ls_l1` after crouch ends. The input is no longer a valid low attack, but remains buffered and silently converts into a high starter.

3. **Broken improvised weapons retain an invalid combo route**

   `src/sim/world.ts:1620-1627` changes the weapon on break but leaves the attack runtime intact. `:1036-1044` then links using the current attack ID, while `src/sim/attacks.ts:583-603` resolves `nextLight`/`nextHeavy` without checking that the route still belongs to the current weapon.

   Reproduce with a club at durability 1, a dummy enemy in range, and:

   ```js
   step(1/60, { lightPressed: true }); // cl_l1
   step(1/60, {});
   step(1/60, { lightPressed: true }); // buffer follow-up
   ```

   When `cl_l1` hits, the weapon becomes longsword, but the buffered follow-up becomes `cl_l2` while `player.weapon === 'longsword'`.

### Deliberate choices / verified behavior

- `src/sim/world.ts:2076-2084` intentionally treats `pressed` flags as already edge-filtered. Repeated `true` samples at 30/60/120 Hz therefore represent repeated taps; the current regression test explicitly requires adjacent fresh Cut edges to count separately. This is safe only if the input producer preserves that contract.
- Hit-stop aging is intentional: `src/sim/world.ts:499-506` ages buffers before freezing simulation, matching `src/sim/combo.ts:29-37`.
- Guard-relative facing, one-shot timed parry, counter while Guard is held, committed heavy/whiff recovery, chain limits, and session command reset were covered by the focused tests and showed no additional defect.

The compiled `site/js` mirror changed during the audit. An initial failure came from stale compiled code; after regeneration, the current focused run passed all 69 tests, and `tsc --noEmit` passed. Runtime probes above used the current compiled mirror; source review treated `src/` as authoritative. No visual or physical-phone testing was performed.