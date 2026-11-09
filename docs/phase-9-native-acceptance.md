# Phase 9 Step 6: native navigation acceptance record

November 9, 2026. Step 5 is committed as `e780fe7` on `navigation`; runtime source
is unchanged from Step 4 `a56a584`. This record is in progress. Phase 9 native
acceptance is **pending**, particularly explicit eight-delivery and iOS evidence.
No runtime changes were required while preparing this record.

## Observed environment

Read-only Android SDK checks on the connected emulator established:

| Item | Observed value |
| --- | --- |
| Emulator | `emulator-5554`, `Medium_Phone_API_35` |
| Android | 15, API 35 |
| Installed RouteRunner | `com.livingwell088.routerunner`, version 1.0.0, versionCode 1 |
| Installed RouteRunner package update date | November 6, 2026, as reported by the device |
| Active Google Maps | `com.google.android.apps.maps`, version 26.44.05.1006895251, versionCode 1068856900 |
| Package-scoped directions resolution | `com.google.android.apps.maps/com.google.android.maps.MapsActivity` |
| Source under acceptance | Runtime `a56a584`; documentation through `e780fe7` |

The package manager also lists an older bundled Maps system copy. The active
version code was confirmed separately with `pm list packages --show-versioncode`.
The installed development app's versionCode does not identify the JavaScript
bundle served by Metro; reload from this checkout before testing. No exact
installed-native-source commit is inferred from the package version alone.

These checks did not launch Maps, calculate a route, read customer receipts,
modify app data, change keys or touch the real Google ledger. Successful intent
resolution establishes an available handler, not destination acceptance.

## Evidence register

| Case | Expected observation | Status |
| --- | --- | --- |
| A01: normal Google full-route handoff | All calculated deliveries in order, restaurant last, no address typing | User reported good after earlier emulator checklist; exact stop count/outcomes not supplied |
| A02: individual destinations and return | Driver explicitly advances; every selected delivery and restaurant opens; no automatic completion | User reported good after Step 4 checklist; exact case outcomes not supplied |
| A03: one-delivery boundary | Full round trip; single-mode Next immediately selects restaurant | Pending explicit result |
| A04: eight-delivery boundary | Eight deliveries in calculated order and restaurant return, none omitted | Pending explicit result |
| A05: changed sequence | Move a stop, Update route, observe that exact sequence in Maps | Included in prior checklist, but pending explicit case result |
| A06: foreground/background | Same selected stop and unchanged orders after returning | Included in prior checklist, but pending explicit case result |
| A07: process restart | Valid saved orders/sequence restore; fresh calculation required; selection starts fresh | Pending explicit result |
| A08: unavailable app/dialog cancellation | Explicit alternative; Cancel/dismiss opens nothing and preserves preference/run | Automated coverage; pending native observation on disposable test setup |
| A09: actual launch failure/retry | No data loss; retry reopens selected destination; no automatic loop | Injected failure passes; real failure not induced or claimed |
| A10: current iOS Apple Maps | Complete round trip and explicit individual-stop/return handoffs | Pending macOS/iPhone build and walkthrough |
| A11: iOS Google Maps | Correct app, all destinations and return; saved preference survives restart | Pending macOS/iPhone build and walkthrough |
| A12: older-iOS Apple fallback | Await Continue; Cancel/dismiss opens nothing; every individual stop and restaurant available | Pending compatible iPhone/simulator walkthrough |

Do not promote the broad user reports into detailed case passes without the
corresponding observation. For each new result, record date, case, platform/app
version, expected versus observed behavior, and any screenshot reference. Keep
private addresses and keys out of shared evidence.

## Next emulator walkthrough

Keep the existing backend (8002), emulator and Metro terminals running. No code
changed in Steps 5-6, so no new native build is required if the Step 3 adapter was
already installed. Reload with **r** in Metro to use this checkout. Use synthetic
orders and current placed dates; live lookup/calculation uses the existing allowance.

1. **One delivery:** calculate the route and open full-route Google Maps. Expect
   restaurant → delivery → restaurant. Return and choose More → Navigate one stop
   at a time. Next must select the restaurant immediately; open it and verify.
2. **Eight deliveries:** calculate eight distinct test destinations, note the
   RouteRunner order, and open full-route Maps. Verify every delivery in that order
   plus restaurant last. If Maps drops/reorders anything, report it; do not call
   the full-route case passed merely because Maps opened.
3. **Changed sequence:** move one stop under Edit stops and Update route. Open
   Maps again. Expect the updated sequence; returning must preserve all orders.
4. **Background:** choose single-stop mode and select stop two. Go to Android
   home, then reopen RouteRunner. With a still-valid route, expect stop two still
   selected. Reopen it; Maps must receive the same destination.
5. **Restart:** close the app through Android's recent-apps screen, reopen and
   report whether Android recreated the process or merely resumed it (a swipe-away
   alone is not guaranteed proof of process death). For a confirmed restart, the
   run must restore within its eight-hour window, require a fresh calculation and
   begin navigation fresh. Do not clear app data or uninstall to simulate this.
6. **Report:** provide results such as `A03 pass; A04 pass; A05 pass; A06 pass;
   A07 not tested`. Include any fallback dialog, missing destination or wrong order.

A full-route failure is actionable even if explicit one-stop navigation works.
If it occurs, keep the run and describe which provider/platform/stop count failed
so the capability rule can be corrected and retested before completion.

## iOS dependency and completion

Native iOS compilation requires macOS/Xcode and an appropriate iPhone/simulator.
The Android emulator cannot validate Apple Maps, iOS Google Maps, or iOS scheme
permissions. A compatible older iOS target is needed to observe legacy fallback;
version-branch unit tests are not equivalent evidence.

Step 6 completes only after required platform cases have observed results or an
explicitly agreed narrower release scope is recorded. Device access limitations
remain pending; they do not turn into automatic passes. No such scope reduction
has been authorized. Missing-app and real-failure conditions should be exercised
only on a disposable test setup; do not disrupt personal navigation data.

See [Step 5 regression evidence](phase-9-regression-acceptance.md),
[Step 4 walkthrough](phase-9-stop-navigation.md), and
[native rebuild instructions](phase-9-navigation-recovery.md).
