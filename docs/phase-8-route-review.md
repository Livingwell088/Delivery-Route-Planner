# Phase 8 Step 4: Understandable route review

Step 3 is committed as `4b9b099` on `endtoend`, including the clearer older-backend
request error. Step 4 is committed as `23a16b0`. Reorder/recalculate controls
remain Step 5; no dispatcher/multi-driver functionality is introduced.

## What the driver sees

- A recommended-route or driver-selected-route heading, matching the API's mode.
- Total driving labeled **including return**, delivery-stop count and a fixed
  planned departure. All route clocks explicitly show Eastern EDT/EST.
- Each numbered stop's complete confirmed address/unit, receipt placed clock,
  **Estimated arrival**, **Predicted order age at delivery**, driving from the
  restaurant/previous stop, and cumulative driving from departure.
- A separate restaurant-return card with the restaurant address, estimated return
  clock, final return-leg driving, and complete route driving duration.
- All backend explanation lines under **Why this route**, or **About this stop
  order** for a fixed-sequence evaluation. Raw numerical scores are no longer the
  API's driver-facing explanation.
- The Google preview is labeled **Stop-order preview**, with text explaining that
  its connecting lines show the sequence rather than actual driving roads.

Arrival and return clocks come from Step 2's validated API fields; this step does
not recalculate them from current time. Order age remains the total time from
placement until predicted delivery, not additional drive time. The screen states
that Google driving estimates exclude live traffic and assume zero time at stops.
It asks the driver to recalculate when the departure changes. Development estimates
are explicitly distinguished from Google road times.

Eastern calendar-day comparison marks **next day** and **previous day**, and
includes an explicit date for larger differences. It uses calendar dates rather
than elapsed 24-hour periods so daylight-saving changes do not mislabel the day.
The EDT/EST suffix distinguishes repeated fall-back clock times. Receipt time
editing is unchanged and remains clock-only.

## Explanation rules

The backend describes the existing driving/total-age/lateness tradeoff using
actual evaluation results. When stop order matches a baseline, it says so. When
different stop orders tie under the score, it explicitly identifies the tie and
does not claim one strictly improves the result. Where sequences differ, it
reports actual driving differences, summed total order ages, and combined minutes
beyond the existing 45-minute age threshold. It does not claim an older order was
prioritized without evidence from the resulting route.

Fixed-sequence evaluations say the driver-selected order was preserved and no
automatic optimization was applied. They report full driving and predicted order
age range/count above the threshold without presenting the route as recommended.
Scoring, stop selection, Google requests and usage accounting are unchanged.

## Verification — October 19, 2026

- **150 mobile tests passed**, including five new review-formatting cases.
- **249 backend tests passed**, including three new factual/tied/manual
  explanation cases and all previous receipt/route acceptance checks.
- The existing actual-mobile/HTTP timing harness now exercises the production
  route-review formatter against a real mocked-provider response, including units,
  arrival clocks, restaurant return and driver-selected labeling.
- Android Hermes export passed at `mobile/dist/phase8-step4` (ignored), using the
  approved installed compiler outside the sandbox. `git diff --check` passed.
- No live Google calls were made. The existing Starlette/httpx warning remains.
- Native layout, scrolling, map rendering and external Maps interaction were not
  verified. iOS native checks require macOS/iPhone; Android export does not verify
  native UI behavior.

Full commands are the standard root pytest command and `node --test` from
`mobile/`. New focused checks:

```powershell
# Root: explanations and actual-JavaScript/HTTP timing/review acceptance.
.\.venv\Scripts\python.exe -m pytest tests/test_explanations.py tests/test_phase8_timing.py -q -p no:cacheprovider

# From mobile/: Eastern clocks, midnight/DST, units and route-mode presentation.
node --test --test-reporter=spec test/routeReview.test.js
```

## Exact manual checks and expected results

1. **Load updated code.** Stop/restart the backend on **8002** using the startup
   guide and reload the installed native app. Backend restart is needed to see the
   new explanations. Keep your valid saved orders; do not clear the usage ledger.
2. **Review a fresh route.** Confirm two or three distinct orders and optimize.
   Expect all orders once, numbered consistently with the map, a departure clock,
   and total driving explicitly labeled as including return.
3. **Check one stop's arithmetic.** Note its departure, cumulative driving and
   placed clock. Expect arrival = departure + cumulative driving, and predicted
   total age = arrival − placed instant, floored to whole minutes. The per-leg
   drive should equal its cumulative duration minus the previous stop's cumulative
   duration. The first leg starts at the restaurant. EDT/EST indicates the clock
   offset; do not equate total order age with driving duration.
4. **Check units.** Use a receipt with an apartment/suite/room. Expect that unit
   once in the confirmed stop address. Open navigation and verify the same
   destination details through the existing handoff. No new navigation behavior is
   introduced in this step.
5. **Check return.** Scroll past the final delivery. Expect the restaurant address,
   estimated return clock and final-stop-to-restaurant minutes. Verify return =
   departure + total driving, and total driving = last cumulative driving + final
   return leg. Return travel must not increase order ages at earlier delivery stops.
6. **Read explanations.** Expect the full explanation, including actual baseline
   driving/age comparisons or a matching-order statement. Where there is a tie
   between different sequences, expect tie wording rather than a strict-win claim.
   A tie is not guaranteed for real addresses; the deterministic explanation test
   covers it. Fixed-sequence API responses use driver-selected wording; the manual
   route controls will expose that screen path in Step 5.
7. **Scroll and map labels.** On a small screen, inspect a long address and all
   stops, the return card, every explanation line, and both actions. Expect text
   to wrap and everything to remain reachable by scrolling. Expect **Stop-order
   preview** and its straight-line clarification; these lines are not road paths.
8. **Preserve the planning anchor.** Note the departure/arrivals, leave the route
   open for a minute, then review again. Expect unchanged planned clocks with the
   explicit recalculation instruction, not silently shifting ETAs.
9. **Mutation regression.** Return to Orders, cancel a rescan: expect the old route
   still reviewable. Confirm a replacement/removal: expect calculation required.
   Recalculate explicitly: expect the current orders, updated clocks and complete
   review. Do not expect old route estimates to survive app restart.

For exact timing without live Google calls, the review unit test uses departure
**6:00 PM EDT**, A placed **5:30 PM** and arriving **6:08 PM** (age **38 min**), B
placed **5:45 PM** and arriving **6:14 PM** (age **29 min**), and return **6:24 PM**.
It also verifies **12:06 AM EDT · next day**, fall-back arrival **1:06 AM EST**,
and spring-forward arrival **3:06 AM EDT**. These edge cases are automated; a
native midnight/DST walkthrough has not been performed. Real Google times vary.

Normal native lookups/optimizations consume existing allowance. Rendering this
review adds no provider request. The map uses the existing SDK configuration;
keys remain in ignored environment files.
