# Simpler Orders and Route pages — October 20, 2026

This updates the uncommitted Step 5 UI following driver feedback that the pages
offered too many choices. Nothing in this update is committed.

## Normal workflow

Orders shows the receipt list without a second map, with **Scan next receipt**
and one main route button:

- **Optimize route** for a new run.
- **View route** after a successful calculation.
- **Update route** when an existing sequence needs fresh estimates. This keeps
  the current sequence rather than silently optimizing a manually chosen order.

The separate **Review stop order** action is removed. Each order's **•••** menu
contains Rescan and Remove; the existing confirmation and safe replacement flows
remain intact. Restaurant selection is still shown when confirmation is needed.

Route shows departure, restaurant-return clock, total driving, and stop count.
Per the follow-up request, **Open in Google Maps / Apple Maps** is at the bottom.
Each stop always shows its address, placed time, arrival, total order age at
delivery, driving from the prior stop and cumulative driving from departure.

Optional controls are opened explicitly:

- **Edit stops** shows move/remove controls. **Done editing** hides them. Moving
  or removing still clears outdated predictions and prevents navigation. An
  invalidated route offers one primary **Update route**, preserving the sequence.
- **Details** shows full restaurant-return details and route explanations.
  **Hide details** hides those extras; order information remains visible.
- **More** offers Update estimates, Optimize again, and Back to orders. The menu
  explains that updating preserves order while optimization can change it.

The existing route map remains a labeled stop-order preview. No provider,
validation, age/ETA arithmetic, usage accounting or persistence code changed for
this UI simplification. Opening menus and details does not calculate a route.

## Verification and manual checks

All **152 mobile tests passed** and `git diff --check` passed. Android Hermes
export passed at `mobile/dist/phase8-simpler-pages` (ignored), using the approved
installed compiler outside the sandbox. No live Google calls were made. Native
layout/menu interaction remains unverified; the bundle check does not verify it.

Reload the installed native app; this UI update needs no backend-code restart:

1. Open Orders with several receipts. Expect a compact list, no Orders map, one
   scan button and one route button. Expect no Review stop order action.
2. Open an order's ••• menu. Expect Rescan, Remove and Cancel. Cancel leaves the
   run unchanged; the other actions retain their existing confirmation behavior.
3. Optimize/View route. Expect all order information visible without opening
   Details, and Open in Maps at the bottom after the route content. Return time
   remains visible above.
4. Tap Details, then Hide details. Expect the extra timing and full explanations
   to appear/disappear without another API request or changed route clocks.
5. Tap Edit stops, then move a stop. Expect controls only while editing, no old
   timing after the change, and Update route instead of a navigation action.
   Update route must preserve the displayed order and restore fresh timing.
6. Open More and choose Optimize again. Expect an explicit new optimization;
   simply opening/canceling the menu must not change stops or call Google.
7. Remove a stop or add a receipt, then return to Orders. Update route preserves
   the retained/appended sequence. Restart still restores valid orders and desired
   sequence, with estimates requiring recalculation.
