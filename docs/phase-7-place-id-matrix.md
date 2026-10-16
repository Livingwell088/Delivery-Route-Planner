# Phase 7 Step 5: route matrices use confirmed Place IDs

Step 4 is committed as `539eaa7`. Step 5 is implemented and uncommitted for review.

## Behavior

Every Google matrix origin and destination now uses
`{"waypoint":{"placeId":"confirmed Google Place ID"}}`. The restaurant is
included in both arrays, so the optimizer receives delivery-to-restaurant return
legs as well as restaurant-to-delivery and delivery-to-delivery travel times.
Display addresses, receipt text and coordinates are not sent as matrix waypoints.
The existing backend gate verifies confirmation references before this adapter
runs. The adapter also refuses addresses lacking a location snapshot; it relies
on that gate for signature verification.

The request explicitly uses `DRIVE` and `TRAFFIC_UNAWARE`, preserving the previous
default traffic behavior. These are road travel estimates without live traffic.
The field mask remains `originIndex,destinationIndex,duration,status,condition`.
The delivery limit remains eight orders plus the restaurant: at most a 9-by-9
request (81 elements). No matrix cache, dispatcher capacity change or spending
cutoff is included in this step.

Response handling preserves direction and maps cells by their indices even when
Google returns them out of order. Omitted zero indices follow protobuf JSON
defaults. Every directed non-self pair must exist. Duplicate cells, invalid
indices/status structures, missing legs and malformed durations produce a
structured HTTP 503 `map_provider_unavailable`, preventing an incomplete route.
Unavailable directed pairs produce HTTP 422 `route_unavailable`, with affected
origin/destination order IDs.

Seconds are rounded up to whole minutes using decimal arithmetic. A true zero
duration remains zero, allowing two orders at one building without inventing an
extra driving minute. Self-travel is zero under the existing domain contract.
Orders sharing a Place ID remain distinct orders and retain their separate units,
raw inputs, coordinates and signed metadata in the returned stops.

Official references checked October 16, 2026:

- [Waypoint Place ID fields](https://developers.google.com/maps/documentation/routes/reference/rest/v2/Waypoint)
- [Matrix indices, limits and element errors](https://developers.google.com/maps/documentation/routes/compute_route_matrix)
- [Traffic preference behavior](https://developers.google.com/maps/documentation/routes/reference/rest/v2/RoutingPreference)

## Verification

- **189 backend tests passed**, including 32 additional matrix/integration cases.
  They cover shuffled asymmetric durations, return legs, duplicate/missing cells,
  invalid indices and statuses, zero/fractional durations, unusable pairs and
  preservation of two units sharing one building Place ID. Existing confirmation
  expiry/tampering tests remain green. The existing Starlette/httpx deprecation
  warning remains.
- Live Google test: restaurant `217A Chandler St`, Worcester City Hall `455 Main
  St`, and `100 Grove St`, all Worcester, each looked up and confirmed successfully.
  The route returned HTTP 200, two stops and 19 total driving minutes. The test
  inspected the actual outgoing request and asserted that all waypoints matched
  the confirmed Place IDs, then verified unchanged returned address snapshots.
  Optimization made **zero geocoding calls**. Live setup used three geocoding
  calls and one 3-by-3 matrix request (nine elements).
- `git diff --check` passed. Mobile code is unchanged, so no new Android build
  or mobile test run is required for this backend-only step.

## Manual check

1. Restart the backend using the [startup guide](startup-guide.md). Existing
   unexpired Step 4 confirmations remain valid if its Google key is unchanged.
2. In the app, add two or three destinations and review the restaurant if prompted.
   Submit the route. Expect every order exactly once, preserved units and sensible
   drive estimates. Exact order/times depend on the addresses and order ages.
3. Submit again with the same confirmed locations. Expect success without new
   address lookup requests. A new matrix request is still expected each time;
   request deduplication and spending controls belong to Step 6.
4. Open navigation. Expect the same delivery destinations and restaurant origin.
   Navigation may choose different roads or ETAs because these matrix estimates
   do not include live traffic.

The live backend/API flow is verified. The native walkthrough above remains a
manual regression check; it was not performed during Step 5.
