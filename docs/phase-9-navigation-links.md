# Phase 9 Step 2: validated navigation links

October 20, 2026. Step 1 is committed as `b7808ec` on `navigation`.
This step implements pure link construction; availability checks, interactive
fallback selection and native acceptance remain Steps 3, 4 and 6 respectively.

## Changes

Both providers now receive building coordinates from the supplied confirmed
route, rather than asking Apple to geocode display addresses containing units.
Units and address labels remain unchanged in RouteRunner. Google Place IDs are
not passed to Apple. No mock restaurant default remains in the link builder.
The existing handoff freshness gate remains responsible for signed confirmations;
the pure builder validates address labels and numeric coordinate ranges.

Full-route links retain all one-to-eight deliveries in supplied order, with the
restaurant as both origin and final destination. Invalid/empty/sparse/oversized
routes, unknown app identifiers, missing locations and invalid selection options
return null. Apple capability uses version components, so iOS 18.10 correctly
qualifies and malformed versions conservatively use legacy directions.

`createNavigationDestination` builds directions to one building without a fixed
origin. `createNavigationRoute` also accepts a fifth options argument:

- `mode`: `full_route` (default) or `single_destination`.
- `destinationIndex`: zero-based delivery index; `stops.length` selects restaurant.
- `transport`: `native` (existing caller default), `browser` or `unknown`.

Browser/unknown transport always returns a single-destination link, without
waypoints. Returned metadata includes mode, fallback reason and selected index
for single-destination handoffs. Google's 2,048-character limit has a defensive
fallback; using coordinates and the eight-order cap keeps normal links well below
that limit without truncation. Apple documents repeated waypoints but supplies no
numeric waypoint/URL limit in the reviewed unified reference; no such limit or
native acceptance is inferred here.

Existing App callers still use the default transport and first-stop Apple fallback.
This step does not detect installed apps, resolve the existing non-awaited fallback
alert, or expose the new destination selector. These remain necessary follow-ups;
the new API alone does not complete Phase 9.

## Verification

- 163 mobile tests passed, including one/eight-stop round trips, encoded
  coordinates, version boundaries, browser/unknown fallback, every selected
  delivery and restaurant, invalid inputs and retained unit data.
- 250 backend tests passed, including isolated Phase 7/8 cross-stack acceptance
  using the updated production builders. Existing Starlette/httpx warning remains.
- Android Hermes export passed at ignored `mobile/dist/phase9-step2`, after
  running outside the sandbox to allow the installed Hermes compiler.
- No live provider requests or native Maps launches were used. Automated checks
  do not establish external app destination acceptance.

Apple's official unified URL reference was retrieved successfully through its
documentation JSON endpoint, resolving the Step 1 retrieval limitation. It
confirms iOS 18.4+, coordinate source/destination, repeated `waypoint`, driving
mode, and current-location directions when source is omitted:
[Apple unified Maps URLs](https://developer.apple.com/documentation/mapkit/unified-map-urls).
Google encoding/length and native/browser distinctions follow
[Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started).
Read the [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) as required
by `mobile/AGENTS.md`. No dependencies or native configuration changed.
