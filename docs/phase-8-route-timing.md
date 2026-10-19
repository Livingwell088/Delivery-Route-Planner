# Phase 8 Step 2: Authoritative clocks and fixed-sequence evaluation

Step 1 is committed as `b469239`; Step 2 as `4a4b4fc` on `endtoend`.
Google remains the delivery provider. This step adds the
backend/service contracts; visible reorder controls and richer route cards remain
Steps 5 and 4 respectively. No dispatcher or multi-driver functionality is added.

## Request contract

`POST /routes/optimize` chooses an age-aware sequence. New
`POST /routes/evaluate` evaluates exactly the supplied `sequence`; it never runs
the optimizer or substitutes a different order. Both use 1–8 unique orders and
the existing restaurant/location confirmation gate.

Both accept `start`, `orders`, and optional timezone-aware `departure_at`. Each
order supplies `order_id`, `address`, and timezone-aware `placed_at`. Mobile now
sends placed timestamps and one explicit departure timestamp after address
preparation. If departure is omitted by an API caller, the backend captures it
once during request validation, before provider work.

Legacy `age_minutes`-only orders remain supported. Their placed timestamp is
inferred as departure minus that age and labeled `age_basis: "age_minutes"` in
the response. Timestamp-based orders are labeled `age_basis: "placed_at"`. If
both are supplied, age must equal the whole elapsed minutes at departure.
Missing times, naive timestamps, future placed times relative to departure, and
conflicting ages return HTTP 422 before provider work.

Evaluation additionally requires `sequence`, containing each submitted order ID
exactly once. Duplicate, missing, unknown or extra IDs return HTTP 422 before any
Google request/reservation. Addresses must still contain valid, unchanged signed
Google confirmations; coordinates or Place IDs alone are insufficient. Units
remain separate and bound to the confirmed address.

## Response contract

Both endpoints return the existing stops, score and explanation plus:

| Field | Meaning |
| --- | --- |
| `start` | Resolved/confirmed restaurant snapshot used for this calculation |
| `departure_at` | Fixed absolute planning/departure instant |
| `calculated_at` | Backend completion instant, independent of planned departure |
| `route_mode` | `optimized` or `evaluated` |
| `travel_time_basis` | `traffic_unaware` for Google; explicitly `development_estimate` for the existing development provider |
| `stop_service_minutes` | Currently `0`; no parking, handoff or other stop delay modeled |
| `return_drive_minutes` | Directed final-stop → restaurant leg |
| `return_at` | Departure plus complete driving duration, including that return leg once |

Each stop additionally includes `drive_minutes_from_previous_stop`, `placed_at`,
`arrival_at`, `predicted_order_age_minutes`, and `age_basis`.

Arrival = departure + cumulative driving. Predicted total age = whole elapsed
minutes between placed time and arrival, rounded down. This is also the existing
`predicted_wait_minutes` alias. The scoring engine uses the same whole-minute age
basis, including the existing lateness threshold/weights. Google leg durations
retain the existing per-leg round-up to whole minutes. Receipt seconds and
milliseconds remain in the absolute placed timestamp. Total driving includes
return; stop ages do not include travel after that stop.

Absolute UTC arithmetic supports Eastern midnight and daylight-saving changes.
Clock presentation still belongs to the mobile display; it must use Eastern
time and make next-day arrivals clear when the richer review is implemented.
These are planning estimates from the restaurant, without live traffic or route
progress tracking. The API does not claim that `calculated_at` equals departure.

## Usage, recovery and mobile validation

Each explicit optimization/evaluation requests a fresh directed matrix using
verified Place IDs. Existing overlapping-request sharing, allowance reservation,
timeouts and retry accounting remain unchanged. For `n` deliveries, an outbound
matrix attempt reserves `(n + 1)^2` units including diagonals. Already completed
results are not reused as a provider cache. Valid confirmations need no fresh
geocoding. Zero allowance prevents matrix transport and preserves inputs.

The mobile `evaluateRoute` service shares optimization's timeout, abort and
structured error handling. It validates a complete supplied sequence locally
before HTTP work. The response gate checks mode, every ID/position, exact
requested evaluation order, address/unit/confirmation snapshots, departure,
placed times, cumulative/individual legs, arrival/age arithmetic, and restaurant
return consistency. Missing old-contract timing fields or inconsistent results
are rejected; saved orders are retained. Restart the backend along with reloading
the mobile bundle, because the new client requires this timing contract.

Route state records backend departure/completion fields while retaining Step 1's
request ownership guards. Step 5 will wire the evaluation service to explicit
manual reorder/recalculate controls; this step does not expose those controls yet.

## Deterministic acceptance example

The backend mock case uses departure **6:00 PM Eastern on October 19, 2026**,
order A placed **5:30 PM**, and B placed **5:45 PM**.

| Evaluation | Driving legs | Arrivals / total order ages | Restaurant return |
| --- | --- | --- | --- |
| A → B | 8 + 6 + 10 min | A 6:08 PM / 38 min; B 6:14 PM / 29 min | 6:24 PM; 24 min total |
| B → A | 3 + 12 + 7 min | B 6:03 PM / 18 min; A 6:15 PM / 45 min | 6:22 PM; 22 min total |

Explicit optimization chooses B → A in this case; evaluating A → B retains it.
A separate actual-JavaScript/HTTP acceptance case uses the existing shuffled
4-by-4 Google mock and verifies C → A → B, receipt sub-minute precision, units,
clock presentation, return, manual route state, and explicit later departure.

## Exact manual checks

1. Restart the backend on **8002**, reload the native app, add/restore two valid
   orders and confirm the restaurant. Optimize. Expect the existing route screen
   with all orders and its departure basis; no incomplete-route error. This is a
   regression check, not the future clock-card UI.
2. Open `http://127.0.0.1:8002/docs`. Expect both `/routes/optimize` and
   `/routes/evaluate` and the timing fields in their schemas.
3. For a live API check, use `/addresses/validate` followed by `/addresses/confirm`
   for the restaurant `217A Chandler St, Worcester, MA 01609`, A at
   `455 Main St, Worcester, MA`, and B at `100 Grove St, Worcester, MA`. Review
   each returned candidate before explicitly confirming it. Retain each complete
   confirmation response locally; do not replace it with just coordinates or a
   Place ID. This setup uses three geocoding lookups under normal single-attempt
   success. Confirmation itself makes no new provider call.
4. In `/routes/evaluate`, use those three confirmed Address objects in this body
   (replace the marked objects; do not send placeholder strings):

   ```json
   {
     "start": { "...": "complete restaurant confirmation object" },
     "departure_at": "2026-10-19T18:00:00-04:00",
     "orders": [
       { "order_id": "A", "address": { "...": "complete A confirmation object" }, "placed_at": "2026-10-19T17:30:00-04:00" },
       { "order_id": "B", "address": { "...": "complete B confirmation object" }, "placed_at": "2026-10-19T17:45:00-04:00" }
     ],
     "sequence": ["A", "B"]
   }
   ```

   Expect HTTP 200, A then B, `route_mode: "evaluated"`,
   `travel_time_basis: "traffic_unaware"`, and zero stop-service time. Verify
   arrival clocks equal departure plus each cumulative duration; ages equal
   arrival minus the corresponding placed time, floored to minutes. Verify
   return equals departure plus total driving and total driving equals the last
   cumulative duration plus `return_drive_minutes`. Real Google durations vary;
   do not expect the mock table's exact times. Historical departure is an explicit
   test planning anchor, not a historical/live-traffic Google request.
5. Submit with `sequence: ["B", "A"]`. Expect B then A and newly calculated
   directed legs/arrivals/ages/return. Set departure one minute later and repeat:
   order stays B then A; arrival/age arithmetic uses that new departure. New
   Google duration values may also change, so compare against returned legs.
6. Change the sequence to `["A", "A"]`, `["A"]`, and `["A", "unknown"]`, one
   at a time. Expect HTTP 422 `validation_error`. Set A placed time later than
   departure: expect the same rejection. Change a confirmed unit or Place ID:
   expect HTTP 422 `location_review_required`. Read `/maps/usage` before/after
   each rejection: counters must stay unchanged.
7. Send the valid body to `/routes/optimize` after removing `sequence`. Expect
   `route_mode: "optimized"`, exactly the same order set, and consistent timing.
   It may choose either sequence; a different result is not required for real
   addresses. Compare usage: each successful two-order calculation reserves nine
   matrix elements per attempt and no fresh geocoding while confirmations remain
   valid. The next request may exceed allowance and be blocked normally.
8. Follow the Phase 7 zero-allowance restart procedure and submit the valid body
   to either endpoint. Expect HTTP 503 `map_usage_limit_reached`, no additional
   counters and unchanged mobile orders. Restore the normal allowance afterward;
   do not delete the ledger.

To reproduce the exact mock examples without live Google calls, from the root:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_phase8_timing.py -q -p no:cacheprovider
```

That suite includes real local HTTP calls from production mobile JavaScript to
an isolated backend with mocked outbound Google transport. It selects a temporary
port and SQLite database; the running backend on 8002, saved phone orders and real
usage ledger are untouched. Do not run `mobile/scripts/phase8-timing.mjs` against
the live backend; it is only for this harness.

Native Android interaction and external Maps handoff remain manual; iOS native
checks require macOS/iPhone. No live Google calls were made during implementation.

## Verification results — October 19, 2026

- **245 backend tests passed**, including 30 new Step 2 cases and both the
  existing Phase 7 and new Phase 8 actual-JavaScript/HTTP acceptance flows.
- **133 mobile tests passed**, including fixed-sequence endpoint/timeout checks,
  local input rejection, sequence substitution rejection, and response arithmetic
  and destination validation.
- Android JavaScript/Hermes export passed (`mobile/dist/phase8-step2`, ignored).
  The installed Hermes compiler ran with approved execution outside the sandbox.
- `git diff --check` passed; no files are staged for another commit. The existing
  Starlette/httpx deprecation warning remains.
- Native and live API manual checks above were **not performed**. Automated
  acceptance uses mocked Google only and does not establish native UI/iOS support.

Full checks: root `.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider`;
from `mobile`, `node --test --test-reporter=spec` and
`.\node_modules\.bin\expo.cmd export --platform android --output-dir dist/phase8-step2`.
