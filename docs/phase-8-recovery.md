# Phase 8 Step 6: Recovery, persistence and navigation integration

Step 5, including the simplified pages and bottom Maps button, is committed as
`59089b7` on `endtoend`. Step 6 is uncommitted for review. Step 7's final Phase 8
end-to-end acceptance remains ahead. No dispatcher/multi-driver work is included.

## Changes

Location-confirmation expiry now clears a ready route's estimates and navigation
availability while retaining active orders, fingerprints and desired sequence.
The app schedules a check at the next confirmation expiry and checks again when
it returns to the foreground. It does not silently shift departure, substitute a
new stop order or automatically calculate another route. Checks use the current
time and refs, so an old render cannot authorize navigation after expiry. Active
address refresh requests are not interrupted simply because an old confirmation
expires while they are obtaining its replacement.

The driver's next **Update route** performs the existing safe refresh: unchanged,
unambiguous confirmed locations can be renewed; changed/ambiguous destinations
require review. Order-specific review failures identify the order and send the
driver to its **••• → Rescan** action without deleting it or refreshing unrelated
restaurant lookup solely because that order failed. Matrix-level invalid
confirmation errors retain the existing full-review recovery path. Google remains
the provider; there is no estimated-provider substitution or new reusable cache.

Navigation handoff now has a single tested gate around link creation and launch.
It exports the current calculated stop sequence and confirmed restaurant start/
return, including the existing Apple fallback notice. It checks again after that
notice in case the route changed or expired. Maps launch failures are caught and
leave the route available for another tap, without reoptimization or duplicate
orders. The existing Google/Apple URL builders and fallback semantics are retained.
The app also prevents overlapping navigation taps while a handoff is pending.

Session persistence now refuses to save anything until the initial saved-data
read succeeds. A failed read therefore cannot be followed by an empty automatic
overwrite. Only on failure, a small recovery notice offers **Retry loading** or
**Start new run**. Starting over explicitly confirms replacement of the unread run.
New receipt entry is blocked until loading succeeds or that explicit choice is
made. Invalid/expired saved sessions still follow the existing clear-and-notice
rules; this does not extend their eight-hour validity.

Failed saves retain the in-memory run and offer **Retry saving**. Serialized writes
and version tracking ensure older failures cannot clear the latest status or cause
retry to save an older run. Retry uses the latest pending snapshot. Storage success
removes the recovery notice. Normal screens gain no extra controls or dialogs.
Navigation-preference reads/writes also handle storage failures without an
unhandled promise; a failed preference write keeps the current in-memory choice.

The Maps button remains at the bottom. Each route stop's address, placed clock,
arrival, predicted total age and driving information remains visible. Edit stops,
Details and More keep the existing simplified access paths.

## Verification — October 20, 2026

- **160 mobile tests passed**, including eight new expiry, navigation and storage
  recovery cases. Coverage includes exact expiry boundaries, pending refresh,
  actual navigation label order/restaurant, expiry or changed state during Apple
  fallback, Maps rejection/retry, failed restore without overwrite, latest-save
  retry and explicit new-run unlocking.
- **250 backend tests passed**, including all existing cross-stack acceptance
  flows. The reordering HTTP harness now additionally checks navigation failure/
  retry, persistence failure/retry against its calculated route, and expiry
  invalidation without changing order set, sequence or usage counters.
- The harness still uses its existing five mocked geocoding requests and 73
  matrix elements (78 synthetic units). Recovery checks add no Google requests.
  It uses temporary ports/SQLite files, not backend 8002 or the real ledger.
- Android Hermes export passed at `mobile/dist/phase8-step6` (ignored), using the
  approved installed compiler outside the sandbox. `git diff --check` passed.
- No live Google calls or real external Maps launches were made. The existing
  Starlette/httpx warning remains. No keys or private customer receipts were used.
- Native timing/background transitions, storage fault UI and actual navigation
  app acceptance remain manual. iOS native testing requires macOS/iPhone.

Focused checks:

```powershell
# From mobile/: expiry boundaries, navigation gate and storage-failure recovery.
node --test --test-reporter=spec test/routeRecovery.test.js

# Root: actual mobile service modules over isolated HTTP with mocked Google.
.\.venv\Scripts\python.exe -m pytest tests/test_phase8_reordering.py -q -p no:cacheprovider
```

Full checks use the standard root pytest command, `node --test` from `mobile/`,
and `.\node_modules\.bin\expo.cmd export --platform android --output-dir dist/phase8-step6`.

## Exact manual checks and expected results

Reload the installed native app and use the existing backend on **8002**. This
step adds no backend API contract change; backend code must still include Step 2.
Use synthetic receipt orders with distinct, confirmed destinations.

1. **Normal handoff.** Confirm three orders, optimize, edit their sequence, then
   Update route. Expect the chosen order preserved with current timing. Scroll to
   the bottom and open Google Maps. Expect those destinations in order and the
   confirmed restaurant return. On supported iOS repeat with Apple Maps; older
   iOS retains the existing first-stop fallback notice. Confirm actual app behavior
   separately from URL-generation checks.
2. **Maps returns to the app.** Background RouteRunner in navigation and return.
   With unexpired confirmations expect the same valid route and departure anchor.
   Tapping again should work; no duplicate orders or automatic route request should
   occur simply from returning to the app.
3. **Expiry UI simulation on an emulator.** While a calculated route is open,
   background the app, advance the emulator's clock beyond its eight-hour
   confirmation window, and return. Do not restart/clear the app during this check.
   Expect the route predictions and Maps action cleared, an update-required state,
   and all orders/sequence retained. Restore automatic/correct time before using
   Update route. Expect the same sequence calculated again. This exercises device
   freshness/foreground behavior; it is not proof of backend clock expiry. Exact
   server/reference boundaries are verified by automated tests.
4. **Unchanged/changed locations.** Updating expired unchanged confirmations
   should preserve their Place IDs, units and chosen order. If a lookup returns a
   different or ambiguous destination, expect an order-specific review message,
   all orders preserved, and no valid navigation route. Use that order's ••• →
   Rescan to confirm its replacement, then update the route. Live changed-result
   conditions are not reliably inducible; automated tests cover refusal to silently
   substitute a different candidate.
5. **Connection recovery.** Manually reorder, stop the backend and Update route.
   Expect the same sequence retained with a recoverable error. Restart, retry and
   expect exactly one current route with that sequence. Repeat canceling a pending
   update, then immediately retry. No older response may replace the retry result.
6. **Saved-run restoration.** Close/reopen within session validity. Expect saved
   orders, units, placed times, fingerprints and manual sequence; timing still needs
   recalculation and restaurant confirmation. Expired/corrupt saved sessions retain
   the existing explicit clearing notice rather than claiming to restore them.
7. **Storage failure checks.** Run the focused `routeRecovery.test.js` command
   above. Expect eight passing cases, including zero writes after a failed read,
   successful retry of the latest save, and an explicit new-run choice before
   replacing unread data. Native fault-banner taps are not verified by these tests;
   do not erase real app storage to simulate a read/write failure.
8. **Maps-launch failure check.** The same focused suite injects an `openURL`
   rejection. Expect a handled failure, unchanged ready route, and successful next
   attempt. On an actual device, if launch fails, expect the retry message without
   losing orders. A real failure is not required/claimed when Maps opens normally.
9. **Allowance recovery.** Repeat the Phase 7 zero-allowance procedure. Expect a
   usage error with orders/sequence retained, no silent provider substitution and
   no automatic retry loop. Restore allowance and explicitly retry. Preserve the
   real SQLite ledger throughout; changing the app clock is not a billing reset.

Successful native lookups and updates consume the existing Google allowance.
Background expiry checks, navigation URL generation/launch and local persistence
retries themselves do not request a matrix. The pre-existing restaurant-review
lookup may still run on Orders when a missing/expired restaurant needs review.
