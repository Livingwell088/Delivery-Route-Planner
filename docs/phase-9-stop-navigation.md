# Phase 9 Step 4: select each navigation destination

November 6, 2026. Step 3 is committed as `0ddc6e5` on `navigation` after the
user reported the emulator handoff test was good. That report does not replace
the outstanding platform/version/eight-stop acceptance matrix.

## Changes

The default remains the full-route Maps action at the bottom. More now expands
optional actions on the page, including **Navigate one stop at a time**. This
avoids relying on an Android alert with more than three buttons. Existing Update
estimates, Optimize again and Back to orders remain available through More.

Single-destination mode shows the selected stop number and address above the
bottom Maps action. Previous and Next change only the selected destination;
Next from the final delivery selects the restaurant. A separate **Return to
restaurant** selection shortcut is available before that final destination.
The bottom button then opens directions to exactly the selected building,
without a fixed restaurant origin. External Maps can use the driver's location.

Opening, failing or returning from Maps never advances the selection, removes an
order or marks delivery complete. Retry opens the same selection. Explicitly
selected single-stop mode does not repeat the fallback notice on every launch.
When a full-route request instead requires fallback, Continue still waits for
the driver; a launch attempt then enables single-destination controls even if
the external launch fails. Cancel leaves the prior navigation mode intact.

More also offers **Use full-route navigation**, resetting selection to stop one.
The selection belongs to the exact calculated route and is kept in App memory,
so changing screens or backgrounding alone does not lose it. Recalculation,
reordering, removal, expiry or restarting the app clears it; a new ready route
starts in full-route mode at stop one. Existing signed confirmation/freshness
gates still apply to restaurant return as well as deliveries. No selection is
persisted or interpreted as delivery-completion tracking.

Navigation buttons show a pending state, and selection changes are blocked while
a handoff is pending. The launch gate checks selection identity along with route
and preference after asynchronous checks/dialogs. Each order's address/unit,
placed time, arrival, age, leg and cumulative drive remain visible. No backend
contract, keys, provider configuration or usage ledger changed.

## Automated validation

- 183 mobile tests passed, including route-bound selection, invalid selections,
  every delivery/restaurant handoff, unchanged selection on repeat launch,
  failure metadata for retry and mode changes during a pending probe.
- 250 backend tests passed. The isolated reordering/recovery harness now exports
  each calculated delivery plus restaurant as individual links and verifies the
  sequence and usage counters stay unchanged. Outbound provider responses are
  synthetic; the real ledger and saved emulator run are not used.
- Android Hermes export: `mobile/dist/phase9-step4` (ignored). Native modules are
  unchanged from Step 3; no additional native rebuild is required for Step 4.
- Native Maps acceptance and UI observations remain manual. Automated URL and
  injected launch checks do not establish that an external app accepted a route.

## Emulator walkthrough

1. Keep the backend on 8002, emulator and Metro running. If Step 3's rebuilt app
   is installed, press **r** in the Metro terminal to reload JavaScript. Step 4
   does not require another native build. Restored orders may need restaurant
   confirmation and fresh route calculation. Use today's placed times if testing
   ages with older receipt fixtures.
2. Calculate a route with three distinct test destinations. Confirm the usual
   bottom **Open in Google Maps** action still opens the full ordered round trip.
   Return to RouteRunner; the run must remain unchanged.
3. Tap **More → Navigate one stop at a time**. Expect **Stop 1 of 3**, its address,
   disabled Previous, enabled Next and a bottom **Open stop 1 in Google Maps**.
   All order metrics must still be visible.
4. Open stop one. Maps must receive only that delivery without typing an address.
   Return to RouteRunner: selection must still be stop one. Reopen it to verify
   that another launch does not advance or remove it.
5. Tap Next, then the bottom Maps action. Repeat for stops two and three. Expect
   each selected address in calculated order. Previous should reopen an earlier
   selection without changing the calculated route.
6. Tap Next from stop three. Expect **Return to restaurant**, the restaurant's
   address, disabled Next, and the corresponding bottom Maps action. Open it and
   verify the restaurant is supplied. Alternatively, use the restaurant shortcut
   from an earlier delivery; it selects the restaurant without launching yet.
7. Tap **More → Use full-route navigation**. Expect the normal full-route button.
   Re-enter single mode; selection should begin at stop one.
8. Select stop two, switch to Settings and back, or background/return without
   changing the route. Expect selection retained. Then move a stop under Edit
   stops and Update route. Expect a new ready route with full-route mode; entering
   single mode starts at the new stop one. Orders/units remain unchanged.
9. When convenient, repeat on a one-delivery run: Next should select the restaurant
   immediately. Rapid taps should not create overlapping launches or advance
   selection. Existing launch-failure and expiry behavior has automated coverage;
   do not clear real app storage or disable personal navigation apps to induce it.

Record any wrong destination, unwanted advancement, lost order, hidden metric or
unexpected fallback. Route calculation consumes the existing allowance; switching
selection and local navigation handoff add no backend lookup/matrix requests.
iPhone testing is still needed for Apple Maps and Google Maps on iOS; older-iOS
fallback should show these same continuation controls after Continue.
