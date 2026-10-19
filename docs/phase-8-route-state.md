# Phase 8 Step 1: Route state and timing contract

Implemented on branch `endtoend`; not committed. This step establishes the mobile
route lifecycle. Clock arrival times, fixed-sequence backend evaluation, rescan
replacement, and visible reorder controls belong to subsequent steps.

## Lifecycle

- `empty`: no active orders and no route to navigate.
- `needs_calculation`: current orders/sequence need a calculation. Adding,
  removing, replacing, editing placed time or any address/unit/location data,
  changing restaurant, restoring a session, or manually changing sequence enters
  this state. Old route results are cleared.
- `calculating`: a request owns a unique request ID and the current input revision.
  No previous route can be exported during calculation.
- `ready`: the response belongs to those inputs and that request. Navigation also
  checks the exact input snapshot and unexpired signed confirmations at tap time.
- `failed`: a current request failed; orders and desired sequence remain available
  for explicit retry. No previous calculation can be exported. A location-review
  error may subsequently invalidate the restaurant and return to `needs_calculation`.

No input-changing action automatically calls Google. Request completion,
preparation, or failure from an old revision or canceled request is ignored.
Cancel releases the UI immediately and aborts active address/matrix HTTP work.
It cannot undo a provider request already sent or its reserved usage. New request
cleanup is isolated from an earlier request still finishing after cancellation.

Confirmations refreshed by the active request are adopted as its prepared input
snapshot, after checking request ownership. They cannot overwrite a newer edit.
Opening/canceling a receipt draft does not change active route inputs.

## Sequence contract

The desired sequence contains each active order exactly once. Removal preserves
remaining relative order; new orders append. A manual sequence invalidates
estimates and records `manual` as its source. Evaluation must return that exact
sequence. Explicit optimization can replace it and records `optimized` as source.
The current UI still only calls optimization; Step 2 adds server evaluation and
Step 5 exposes manual controls. No dispatcher or multi-driver behavior is added.

## Time contract

One ISO departure timestamp is captured after location preparation and immediately
before route submission. Every submitted integer order age uses that timestamp,
not separate clock reads. The response's receipt time is recorded separately.
The current API still receives integer ages; Step 2 will extend its timing fields.

Driving durations use Google's existing traffic-unaware matrix. The modeled route
starts at the confirmed restaurant, includes return to that restaurant, and
assumes zero time at delivery stops. This is planning, not GPS/progress tracking.

Future arrival clocks equal departure plus cumulative driving. Predicted total
order age equals arrival minus placed time; existing integer-age calculations
have minute rounding. Return time equals departure plus complete driving duration.
The future timing contract must make rounding consistent, without counting the
return leg twice. Display clocks in America/New_York; keep absolute ISO timestamps
internally and identify next-day arrivals when clock ETAs are implemented.

Passing time does not silently shift a calculated departure, age, or route. Review
currently shows its Eastern departure basis and tells the driver to recalculate
when departure changes. Navigation rejects expired confirmations even without
another render; a timer-driven expiry presentation remains Step 6 integration.

## Persistence

The existing version-1 session key and eight-hour validity rules remain. Only
sequence IDs and source are optionally added, alongside the existing active-order
data/fingerprints. No matrix, route response, timing estimate, receipt image, or
OCR payload is saved. Older sessions remain readable. An invalid sequence
preference is ignored without discarding otherwise valid orders. Restoring valid
orders always requires route calculation and restaurant confirmation again.

## Verification and exact manual checks

Automated checks cover changed inputs, stale success/failure, delayed cancellation,
retry ownership, manual sequence preservation, expiry/export guards, shared
departure ages, and preference persistence/legacy recovery. Native UI and external
navigation checks remain manual. See the startup guide for backend port 8002,
native Android startup and platform limitations. No keys should be printed.

1. Start the backend on 8002 and reload the installed native app. Add two distinct
   synthetic receipts, confirm their Google destinations and restaurant, and
   submit optimization. Expect the existing ordered route plus one fixed Eastern
   departure clock and the no-live-traffic/zero-stop-time explanation.
2. Tap **Review orders**, then **Review calculated route**. Expect the same route
   and departure clock with no new route request. Wait a minute and repeat: the
   original planned clock remains unchanged.
3. Return to Orders and remove one order, first canceling the removal dialog.
   Expect the route-review action to remain. Repeat and confirm removal. Expect
   a calculation-required message and no review/export of the removed order's
   old route. Submit again: expect only the remaining order in the new route.
4. Add another confirmed receipt. Expect calculation required again. Start another
   receipt, then cancel its draft without confirming: expect no active-order
   change and no additional invalidation of an otherwise ready route.
5. Submit a route and immediately tap **Cancel route calculation** while pending.
   Expect responsive Orders, preserved orders, no old route-review action, and
   no delayed jump to Route. Immediately retry; only that retry may display a
   result. If the local response completes too quickly to cancel, the delayed
   response race is covered by automated tests; do not claim native verification
   of that race without observing a pending request.
6. With orders present, stop the backend and submit. Expect a recoverable error
   with orders retained and no old route export. Restart the backend and retry:
   expect a fresh calculated route. No automatic retry loop should occur.
7. Calculate a route, fully close and reopen the app within session validity.
   Expect the same confirmed orders/units/placed times, calculation required,
   and no restored route estimates. Confirm restaurant and calculate again.
8. From a valid route, open the selected navigation app. Expect its current stop
   order and restaurant return (or the existing older-iOS first-stop fallback).
   Actual external-app acceptance still requires native testing.

Live address/route checks consume existing Google allowance. Pure state tests
and the cross-stack mock harness make no live Google calls. Zero-allowance and
usage-ledger recovery checks are unchanged from Phase 7.

Verification on October 19, 2026:

- Backend: 215 tests passed, including the existing cross-stack acceptance flow.
- Mobile: 129 tests passed, including nine new lifecycle/timing/persistence checks.
- Android JavaScript/Hermes export passed at `mobile/dist/phase8-step1` (ignored).
  The sandbox initially denied Hermes execution; the approved export outside
  that sandbox completed successfully.
- `git diff --check` passed. Existing Starlette/httpx deprecation warning remains.
- Native Android interaction and iOS/navigation walkthroughs above were not run.
  Export success does not establish APK installation, UI behavior or iOS support.

Commands: root `.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider`;
from `mobile`, `node --test --test-reporter=spec` and
`.\node_modules\.bin\expo.cmd export --platform android --output-dir dist/phase8-step1`.
