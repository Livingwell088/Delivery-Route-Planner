# Phase 9 Step 1: Navigation platform and fallback contract

October 20, 2026. Design contract for subsequent implementation; no navigation
code changes or native acceptance are claimed by this step. Baseline: `endtoend`
at `47d1fbc`. Each commit requires explicit user confirmation.

## Objective and boundaries

The driver can open directions to every calculated delivery destination and back
to the confirmed restaurant without retyping an address. An external app may
require its own Start/Go tap. RouteRunner does not promise automatic turn-by-turn
startup, external ETA agreement, identical roads, or delivery-completion callbacks.

Keep the bottom Maps action and always-visible order address, placed time,
arrival, predicted age, leg drive and cumulative drive. Editing and extra details
remain optional. Preserve signed location confirmations, separate units, Eastern
clocks, orders/sequence persistence, usage controls and the real Google ledger.
No dispatcher, multi-driver, background tracking or backend API changes are planned.
Do not read, expose or replace keys, reset storage or replace the usage ledger.

## Existing foundation and gaps

- `mobile/src/services/navigationLinks.js` builds Google round trips with ordered
  coordinate waypoints and Apple round trips with repeated address waypoints on
  iOS 18.4+. Older iOS and Android Apple selections currently open only stop one.
- `navigationHandoff.js` checks freshness before link construction and after a
  fallback notification, catches launch failure and permits retry.
- `mobile/src/App.js` persists the app preference and prevents overlapping taps.
  Its fallback notification currently returns immediately from `Alert.alert`, so
  the service's await does not actually wait for driver acknowledgement.
- Settings currently offers Apple on Android. Unknown builder app identifiers
  become Google. App availability, browser limits, link input validation and
  continuation through fallback stops remain implementation work.
- Phase 8 records 250 backend tests, 160 mobile tests and Android Hermes export
  passing. Native Maps acceptance remains pending; these counts were not rerun
  for this documentation step.

## Platform decisions

Full-route means restaurant origin, all calculated delivery stops in their exact
sequence, then restaurant destination. With the eight-order product limit this
requires eight intermediate waypoints, not seven. Never truncate or reorder a
route to fit a link. A single-delivery round trip still includes the restaurant.

| Platform and target | Primary behavior | Required fallback |
| --- | --- | --- |
| Android, Google Maps installed/enabled | Google universal directions URL; full route within documented limits | Explicit single-destination mode if full-route capability cannot be established or the driver reports missing stops |
| iOS, Google Maps installed | Google universal directions URL; full route within documented limits | Same single-destination mode; native acceptance must verify waypoint handling independently on iOS |
| iOS 18.4+, Apple Maps available | Unified `/directions` URL with ordered repeated `waypoint` parameters and restaurant return | Legacy single-destination directions when the full-route path is unavailable or fails |
| iOS below 18.4, Apple Maps available | Legacy single-destination directions | Advance explicitly through all deliveries, then restaurant |
| Google missing/disabled or app capability unknown | Explain that the preferred native app is unavailable or could not be verified | Offer another available native app on iOS, Google browser directions one destination at a time, or Cancel |
| Apple missing/unavailable on iOS | Explain unavailability | Offer Google if available, browser single-destination directions, or Cancel |
| Android with a restored Apple preference | Treat Apple as unsupported for native navigation | Offer Google or browser fallback; do not silently overwrite the saved preference |
| Other/unknown platform | No native-app capability claim | Explicit browser single-destination mode or Cancel; outside native Phase 9 acceptance |

Google mobile browser links support up to three waypoints versus nine otherwise,
and Google URLs have a 2,048-character limit. Product decision: browser fallback
always uses single-destination mode, even for small runs, for consistent behavior.
An HTTPS handler proves neither native installation nor complete waypoint support.
Availability checks have available/unavailable/unknown outcomes; a rejected probe
is unknown, not proof that an app is absent. Recheck on launch rather than keeping
a permanent installed-app cache. A probe cannot establish that all stops arrived.

Prefer existing React Native Linking and universal URLs; adding a dependency or
native bridge requires evidence that the supported handoff cannot otherwise be
met. Step 3 must verify app-specific probes/launch mechanisms against current
official documentation, configure iOS query schemes/Android package visibility
where necessary, and verify generated native configuration in an installed build.
If a native target cannot be distinguished reliably, use the unknown path rather
than claim full-route support. Keep single-destination fallback accessible through
More even after a successful full-route launch, since silent external truncation
cannot be inferred from `openURL`.

## Destination and preference rules

Use fresh, confirmed route locations; never substitute mock restaurant data in
the production handoff. Prefer confirmed coordinates for building identity and
use confirmed provider Place IDs only in the matching provider's documented
parameters. Never send a Google Place ID as an Apple Place ID. Preserve units in
RouteRunner's visible address separately; do not require external geocoding of a
unit to find the building or claim that external Maps displays the unit.

Reject empty routes, unsupported app identifiers, missing confirmed destinations,
nonfinite/out-of-range coordinates and unusable link inputs before external launch.
Unsupported transport capability or an over-limit full-route URL permits explicit
single-destination fallback. Invalid location data requires route review/update;
it must not be bypassed with an unconfirmed address.

Google remains the default. Settings offers Google on Android and Google/Apple on
iOS, with capability explanations where needed. An invalid stored value uses the
usable default. An unsupported but valid stored preference is retained until the
driver explicitly changes it; the launch UI explains any one-time alternative.
A temporary fallback does not rewrite the preference. Failed preference reads
keep a usable default; failed writes preserve the in-memory selection and explain
that it may not survive restart. Resolve restore-versus-user-selection races so
late reads or writes cannot replace a newer choice.

## Driver flow and recovery

1. The bottom Maps action checks the current ready route and confirmation expiry.
   Full-route handoff exports the calculated sequence and restaurant return.
2. When fallback is needed, show a concise reason and Continue/Cancel choices.
   Await the actual response; dismissal counts as Cancel. Do not launch behind
   the dialog. Offer alternatives without automatically chaining app launches.
3. In single-destination mode, show a compact selected destination and bottom
   action such as `Open stop 1 in Apple Maps`. Provide explicit Next/Previous or
   destination selection, including `Return to restaurant`. Keep order metrics
   visible. Advancement selects a destination; it does not mark an order delivered.
4. Single-destination links omit a fixed restaurant origin so Maps can use the
   driver's current location. A missing location permission must not remove the
   supplied destination; Maps may require the driver to enable location/select
   an origin. RouteRunner adds no new location-permission requirement for handoff.
5. Opening, canceling, failing or returning from Maps never advances selection,
   removes orders, recalculates the route or changes the saved app preference.
   Retry reopens the same selected destination. Reopening the restaurant is valid.
6. Recheck current route identity, selected destination and freshness after every
   asynchronous probe/dialog and immediately before launch. Changed/expired state
   blocks launch. Duplicate taps permit at most one pending handoff.
7. Associate selection with the calculated route. Reorder/removal/new calculation
   clears selection and starts a new handoff at stop one; expiry blocks all legs.
   Keep selection while backgrounded within the same valid run. Do not persist it
   across process restarts in Phase 9: restored orders already require a fresh
   calculation, after which selection begins at stop one.
8. Handled failure keeps orders, sequence and valid predictions intact and offers
   Retry, an explicit alternative, or Cancel. Do not loop retries or claim delivery
   completion. Navigation itself makes no backend lookup/matrix requests.

## Acceptance cases for Steps 2-6

| ID | Scenario | Expected evidence |
| --- | --- | --- |
| N01 | One and eight orders; optimized and manually evaluated routes | Decoded links preserve confirmed stops and restaurant both ways; native observation verifies complete ordered handoff |
| N02 | iOS 18.3 / 18.4 / later and malformed version | Deterministic legacy/unified capability decision; unknown version uses fallback; semantic version comparison does not rely on decimal parsing |
| N03 | Google browser, four/eight deliveries | Single-destination fallback; no dropped stops or misleading complete-route status |
| N04 | Every fallback delivery, then restaurant | Each opens the selected confirmed building without typing an address; unit remains visible in RouteRunner |
| N05 | Missing/disabled app, probe false/rejection, unsupported preference | Explained available/unavailable/unknown path; explicit alternative or cancellation; preference unchanged by one-time fallback |
| N06 | Empty route, invalid coordinates, unknown app, encoding, URL length boundary | Safe refusal or explicit transport fallback as appropriate; no mock or unconfirmed substitution |
| N07 | Dialog Cancel/dismiss, stale route after probe/dialog, rapid taps | No canceled/stale launch; at most one pending handoff |
| N08 | openURL rejection, retry, foreground return | Same destination and valid run retained; no advancement, duplicate orders or provider calls |
| N09 | Reorder/remove/recalculate, expiry, process restart | Old selection cannot launch a changed route; existing freshness/recalculation gates hold |
| N10 | Preference restart/read failure/write failure/late restore | Current explicit choice wins; persistence failure is recoverable |
| N11 | Route UI and backend regression | Bottom Maps action and visible metrics retained; signed locations, units, Eastern clocks, saved sequence and usage accounting unchanged |
| N12 | Native Android and iOS walkthrough | Record device, OS, RouteRunner build, Maps version, ordered destinations, restaurant return and any limitations; missing device coverage remains pending |

Builder tests establish URL construction. Injected launch tests establish app-side
recovery. OS link resolution establishes only a handoff attempt. Native walkthroughs
establish observed external app acceptance; none substitute for the others. Browser
directions alone are not proof of native turn-by-turn navigation.

## Implementation sequence and completion

Step 1 is complete when this matrix, fallback flow and acceptance cases are
reviewable. It adds documentation only. Step 2 implements validated links; Step 3
implements availability/preferences/launch recovery; Step 4 implements selection
and progression; Step 5 runs regression checks; Step 6 records native acceptance.
The overall estimate remains 6-12 hours assuming device access and no substantial
native bridge. Native Android/iOS access is a Step 6 dependency, not a blocker for
Steps 2-5. No product clarification is required for these proposed defaults.

## Official references checked October 20, 2026

- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/) and
  [SDK 57 Linking](https://docs.expo.dev/versions/v57.0.0/sdk/linking/): read as
  required by `mobile/AGENTS.md`; no package installation is part of Step 1.
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started):
  universal URL behavior, ordered waypoints, browser/native limits and encoding.
- [Google iOS URL schemes](https://developers.google.com/maps/documentation/urls/ios-urlscheme):
  app-specific alternatives must be assessed separately from universal URLs.
- [Apple unified Maps URLs](https://developer.apple.com/documentation/mapkit/unified-map-urls)
  and [WWDC25 MapKit](https://developer.apple.com/videos/play/wwdc2025/204/):
  unified URL rollout in iOS 18.4; device validation remains necessary. The
  unified reference's JavaScript/Markdown body was not retrievable in this review;
  exact parameter/limit verification remains a Step 2 prerequisite before changes.
- [React Native Linking](https://reactnative.dev/docs/linking): query declarations,
  launch rejection and the distinction between URL handling and native acceptance.
