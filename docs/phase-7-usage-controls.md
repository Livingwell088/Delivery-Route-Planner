# Phase 7 Step 6: Usage controls and request recovery

Step 5 is committed as `907458e`; Step 6 as `bdac8ba`.
See [Step 7 acceptance results](phase-7-acceptance.md) for the cross-stack test.

## Usage allowance

Google requests now reserve usage atomically in SQLite before each outbound
attempt. One geocoding attempt reserves one unit. A matrix attempt reserves
origins multiplied by destinations, including diagonal elements. Retries reserve
again. Network failures, provider errors and ambiguous outcomes are not refunded,
so counters conservatively include potentially charged attempts.

`GET /maps/usage` returns the current UTC day/month, reserved units per API,
daily limits, estimated gross cost and remaining gross allowance. Development
estimate mode reports tracking disabled. Reading this endpoint does not call
Google. It reports this backend's reservations, not the Google billing account.

| Backend setting | Default | Meaning |
| --- | --- | --- |
| `GOOGLE_MAPS_MONTHLY_LIMIT_USD` | `5` | Combined monthly gross allowance. Zero blocks all new Google calls. |
| `GOOGLE_MAPS_GEOCODING_DAILY_LIMIT` | `500` | Geocoding attempts per UTC day. |
| `GOOGLE_MAPS_MATRIX_DAILY_LIMIT` | `2000` | Matrix elements per UTC day. |
| `GOOGLE_MAPS_USAGE_DB` | `data/private/maps-usage.sqlite3` | Persistent counter store; keep it across restarts. |
| `GOOGLE_MAPS_DEADLINE_SECONDS` | `20` | Retry-window deadline, at most 25 seconds. |
| `GOOGLE_MAPS_TIMEOUT_SECONDS` | `10` | HTTP phase timeout, capped by remaining retry window. |
| `GOOGLE_MAPS_MAX_ATTEMPTS` | `2` | Existing maximum attempt count; allowed range 1–3. |

The estimate uses USD 0.005 per unit for both current Essentials SKUs, with no
deduction for free caps, credits, discounts or failed calls. Thus the default
allows **1,000 combined units**, e.g. one geocode plus a 3-by-3 matrix reserves
10 units ($0.05 gross). It can stop operations while the actual Google bill is
still zero. It is a conservative application allowance, not an invoice estimate
or an account-wide billing cap. Raising the allowance permits more usage.

Tracking begins with this implementation; it cannot backfill previous Google
usage. Other apps, Maps SDK traffic, separate databases/replicas, or calls made
outside this backend are not counted. Shared SQLite paths use atomic transactions
across processes; separate hosts require a shared accounting service before
claiming one shared allowance. Production rejects `:memory:` tracking. Explicit
test-factory callers use isolated in-memory counters.

Counters reset logically at UTC day/month boundaries. Only current-month counts
are retained, without addresses, provider results, keys or confirmation tokens.
The existing `data/private/` ignore rule keeps the database out of Git. Deleting
or replacing it resets accounting; preserve it when restarting/deploying.

If the next reservation exceeds a daily or monthly limit, HTTP 503
`map_usage_limit_reached` prevents the provider call. If tracking fails, HTTP 503
`map_usage_unavailable` also prevents it. Restarting with the same database does
not restore spent allowance. Health can remain healthy while Google work is
paused; inspect `/maps/usage` for that distinction.

## Duplicate requests, caching and recovery

The Google client combines identical requests only while they overlap in time.
Concurrent consumers receive the same response or error, and only the leader's
actual attempts reserve usage. Matrix keys include the ordered Place IDs and
routing options; differing order ages can share road durations while each route
is scored separately. These groups are process-local.

Completed responses and errors are removed immediately. No reusable geocoding
result cache or Routes-duration cache was added. Existing confirmed active-order
snapshots and their eight-hour validity from Step 4 remain in place. Place IDs
continue through those snapshots; candidate lists and raw provider responses are
not added to disk. This avoids assuming a broad permission to cache provider
content for replacement calls.

Transient network/5xx/429 failures use bounded attempts with a small exponential
delay and jitter. A `Retry-After` response stops automatic retry instead of
retrying before the requested cooldown. Authentication/configuration errors and
application limits are terminal. Each HTTP attempt uses the smaller of its
configured timeout and the remaining retry window; HTTPX phase timeouts are not
a guarantee of a strict end-to-end wall-clock deadline for streaming responses.

Mobile route requests now abort after 35 seconds, preserve orders, explain
network/provider/allowance failures, and reject incomplete route responses.
Address confirmation failures retain drafts. Allowance, tracking, quota and
configuration errors do not trigger another automatic address lookup. Retry is
user-driven after recovery; no automatic replacement with estimated travel times.

## Verification

- **214 backend tests passed**, including restart persistence, concurrent
  cross-connection reservations, exact cap boundaries, UTC resets, tracking
  failures, retry accounting, matrix unit counts, in-flight sharing and cleanup,
  provider cooldowns, deadlines and invalid settings.
- **116 mobile tests passed**, including route timeout/abort, preserved input,
  usage error codes/messages and malformed route rejection.
- Android Hermes export passed (`mobile/dist/phase7-step6`, ignored output).
- Tests used mock Google transport; **no live Google calls** were made in Step 6.
- The existing Starlette/httpx deprecation warning remains.

## Manual checks

Restart the backend and reload the app for these changes.

1. Open http://127.0.0.1:8002/maps/usage. Expect both API counters, UTC dates and
   the configured monthly allowance. Restart the backend and reopen it: counters
   must remain unchanged. This check makes no Google calls.
2. Add an order and optimize normally. Expect preserved destination details and
   a successful route. Refresh usage: each lookup adds one geocoding unit and a
   route with `n` deliveries adds `(n + 1)^2` matrix units per outbound attempt.
   Repeating a completed route request still consumes another matrix request.
3. To test cutoff without consuming Google usage, stop the backend. In its
   PowerShell terminal set `$env:GOOGLE_MAPS_MONTHLY_LIMIT_USD = '0'`, then run
   the normal startup command. Lookup/optimization should report the allowance
   error while preserving draft/orders; usage must not increase. Stop it,
   run `Remove-Item Env:GOOGLE_MAPS_MONTHLY_LIMIT_USD`, and restart normally to
   restore the `.env`/default setting. Do not delete the usage database.
4. Stop the backend while the app has orders. Submit a route: expect a connection
   error or timeout and the same orders retained. Restart it and retry: expect
   one successful route and no duplicate orders.

Native interaction checks remain manual; the automated transport and export
checks above have passed. Step 7 is the final end-to-end acceptance pass.

## Sources checked October 16, 2026

The selected Geocoding and Compute Route Matrix Essentials SKUs list $5 per 1,000
units at the first paid tier; this implementation deliberately ignores the free
caps. [Google core services pricing](https://developers.google.com/maps/billing-and-pricing/pricing).

The caching implementation is deliberately limited to in-flight work and the
existing active-order flow; it does not introduce a reusable content cache.
References: [service-specific terms](https://cloud.google.com/maps-platform/terms/maps-service-terms),
[Routes policies](https://developers.google.com/maps/documentation/routes/policies).
