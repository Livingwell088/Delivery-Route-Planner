# Phase 8 Step 5: Reorder stops and explicitly recalculate

Step 4 is committed as `23a16b0`; Step 5 as `59089b7` on `endtoend`.
This step exposes the existing fixed-sequence backend contract to the
single driver. It adds no dispatcher or multi-driver behavior.

**October 20 UI update:** The controls below were simplified after driver review.
See [Simpler Orders and Route pages](phase-8-simpler-pages.md) for current labels
and access paths. Recalculation/optimization semantics and validity rules remain;
the earlier screen-by-screen button instructions below describe the first Step 5 UI.

## Driver controls and validity

Route review now provides **Move up**, **Move down**, and **Remove** for every
stop, with accessible order-specific labels and minimum 44-point targets. Move up
is disabled at the top and Move down at the bottom. Controls wrap on narrow
screens. A boundary move is a no-op; successful moves mark the sequence manual.

Moving a stop immediately changes the list/map numbering and clears the calculated
route, departure, stop ETAs/ages, explanations and return estimate. The stop-order
editor stays visible, with an explicit calculation-required message and disabled
navigation. It displays current address/placed time, not old route predictions.
No Google request happens simply because a stop moved.

Both Orders and Route offer two separate calculation actions:

- **Recalculate this order** calls `/routes/evaluate` with a snapshot of every
  displayed order ID, preserving that exact sequence. It refreshes driving,
  departure, arrivals, total order ages and return estimate. The result is labeled
  driver-selected. An unexpected returned sequence is rejected.
- **Optimize again** explicitly calls `/routes/optimize` and permits a new
  recommended sequence. Before any calculation attempt in a fresh app session,
  this button retains the label **Submit and optimize route**. The text beside
  the actions explains the distinction; no background action replaces the choice.

Orders and its map follow the desired sequence too, including after optimization,
manual moves and restoration. **Review stop order** is available before a route
has been calculated; after calculation the action is **Review calculated route**.

Removing a stop from Route uses the same confirmation dialog and receipt-aware
removal as Orders. Canceling the dialog changes nothing. Confirming removes it,
preserves remaining relative order and clears estimates. Adding another delivery
appends to the desired sequence. Rescan replacement retains the replaced stop's
position, including when its corrected order ID changes. Removing the final order
shows an actionable empty route with a link back to Orders/scanning.

If restaurant review is required while calculating from Route, the app returns
to Orders to review it before the driver chooses a calculation action again.
No optimization is silently substituted for evaluation. Existing signed-location,
usage-budget, timeout, retry, stale-response, cancellation and persistence behavior
remains in place. Request cancellation/failure keeps the desired sequence and
blocks navigation until a new calculation succeeds. An obsolete response cannot
change the sequence or clear a newer request's busy state.

Sequence preferences survive an app restart within existing session validity;
calculated estimates do not. Restore returns to Orders for restaurant confirmation
and fresh calculation. Recalculate preserves the restored sequence; choosing
optimization explicitly permits changing it. Route expiry/navigation recovery
presentation is finalized in Step 6.

## Usage and verification — October 19, 2026

Reordering, displaying the editor, canceling removal and removing orders add no
route provider request. Explicit calculations obtain a new matrix through the
existing safeguards; Google allowance and per-attempt reservation rules are
unchanged. Address review can still use geocoding. No provider result cache or
live-traffic service is added.

- **152 mobile tests passed**, including two new movement/display/invalidation
  cases alongside prior fixed-sequence, cancellation, persistence and receipt tests.
- **250 backend tests passed**, including a new production-mobile-services/HTTP
  acceptance flow for optimized route → two moves → failed evaluation → retry →
  exact sequence → removal → evaluation → restore → append → evaluation → explicit
  optimization → empty run. External navigation URL labels retain evaluated order.
- The new harness uses a temporary backend port/database and mocked Google only.
  Five mock lookups and matrices of 16 + 16 + 9 + 16 + 16 elements reserve 78
  synthetic units. Moves and simulated connection failure add none. The real
  backend on 8002, phone orders and usage ledger are untouched.
- Android Hermes export passed (`mobile/dist/phase8-step5`, ignored), with the
  approved installed compiler outside the sandbox. `git diff --check` passed.
- No live Google calls were made. The existing Starlette/httpx warning remains.
- Native controls, layout, alert behavior and external Maps acceptance were not
  tested. iOS native verification still requires macOS/iPhone.

The shared mock backend fixture now optionally supports smaller/expanded matrices
for this acceptance case; all original Phase 7/8 fixture behavior remains the
default and passed its existing checks. Production backend code is unchanged.

Focused checks:

```powershell
# Repository root: production JS services over isolated HTTP, Google mocked.
.\.venv\Scripts\python.exe -m pytest tests/test_phase8_reordering.py -q -p no:cacheprovider

# From mobile/: move boundaries, immediate invalidation, display sequence,
# fixed-sequence evaluation, stale/canceled requests and later input changes.
node --test --test-reporter=spec test/routePlan.test.js test/routeApi.test.js
```

Full checks are the standard root pytest command, `node --test` from `mobile/`,
and `.\node_modules\.bin\expo.cmd export --platform android --output-dir dist/phase8-step5`.
Run `mobile/scripts/phase8-reordering.mjs` only through its Python mock harness.

## Exact native checks and expected results

Reload the installed native app, keeping the current backend on **8002**. The
backend must have Step 2's `/routes/evaluate` contract; if unsure restart it using
the startup guide. This step's production changes are JavaScript only. Use three
distinct synthetic receipt orders A/B/C with valid confirmed destinations.

1. **Initial route.** Confirm the restaurant and optimize. Expect the full route
   review with Move up / Move down / Remove controls on each stop, plus separate
   Recalculate this order and Optimize again actions. Note the recommended sequence.
2. **Move third to first.** Tap the third stop's Move up twice. Expect that stop
   first immediately in the list and numbered map, with other relative order
   preserved. Expect all old ETAs, predicted ages, return and explanations removed,
   a calculation-required message, and the navigation button disabled. Move up at
   the first stop and Move down at the last should be disabled.
3. **Preserving recalculation.** Tap Recalculate this order. Expect exactly the
   manually displayed sequence, fresh clocks/legs/ages/return, driver-selected
   wording, and navigation enabled after success. Open Google Maps: expect this
   exact stop order with the restaurant return; external app acceptance is manual.
4. **Explicit optimization.** Tap Optimize again. Expect a newly calculated
   recommended route with every current order once. It may change sequence; a
   different sequence is not guaranteed for the chosen real addresses. No order
   should change until this explicitly requested optimization succeeds.
5. **Removal.** On Route tap the middle stop's Remove, then Cancel. Expect the
   calculated route unchanged. Repeat and confirm Remove. Expect remaining stops
   in their prior relative order, new map numbering, no old estimates, and disabled
   navigation. Recalculate: expect that exact remaining sequence and a recomputed
   final return leg/full driving time. Remove all remaining orders: expect an empty
   route and Review orders leading to Scan receipt.
6. **Failure and retry.** Manually reorder, stop the backend, then Recalculate.
   Expect a recoverable error with the chosen sequence and all orders retained;
   navigation remains disabled. Restart the backend and retry Recalculate. Expect
   the same chosen order, without duplicate orders or automatic optimization.
7. **Cancel.** Start Recalculate and tap Cancel route calculation while pending.
   Expect the chosen sequence retained and UI responsive, with no delayed jump to
   an obsolete result. Retry immediately: only the new calculation may become
   current. If responses are too fast to observe cancellation, record native
   cancellation as unverified; the stale/cancel behavior is covered by automation.
8. **Add/rescan.** After manual reordering, return to Orders. Its list/map should
   match the chosen sequence. Scan another distinct receipt: expect it appended.
   Rescan a middle order with a corrected ID: expect that replacement in the same
   sequence position. Recalculate: expect that sequence preserved. Neither change
   should calculate automatically.
9. **Restart.** Manually reorder and fully close/reopen the app before its session
   expires. Expect Orders in that saved sequence, with no restored timing estimates.
   Review/confirm the restaurant, then Recalculate: expect exactly that sequence.
   Optimize is still an explicit separate choice.
10. **Small screen/accessibility.** Inspect a long address and eight stops. Expect
    controls to wrap without hiding text, boundary controls disabled, and every
    calculation/navigation action reachable by scrolling. Screen-reader movement
    labels should identify the order. Actual native layout remains to be recorded.

Live successful calculations consume matrix allowance; a run with `n` deliveries
reserves `(n + 1)^2` elements per attempt. Keep existing keys ignored and do not
delete the usage ledger when restarting.
