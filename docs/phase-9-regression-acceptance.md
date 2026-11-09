# Phase 9 Step 5: regression validation

November 9, 2026. Validated `navigation` at `a56a584` (Step 4), following Step 3
`0ddc6e5` and Step 2 `59548db`. This step adds acceptance documentation; no runtime
code changes were needed. Each new commit still requires explicit confirmation.

## Results

- **183 mobile tests passed**, zero failures: full `node --test` from `mobile/`.
- **250 backend tests passed**, zero failures: full pytest suite with cache disabled.
  The existing Starlette/httpx deprecation warning remains.
- **Android Hermes export passed**, 692 modules, at ignored
  `mobile/dist/phase9-step5`. This confirms bundling, not installation or Maps
  destination acceptance.
- `git diff --check` passed for the validated Step 4 source. The worktree was
  clean before this Step 5 documentation was added.

The backend suite includes isolated real-HTTP harnesses using production mobile
service modules, synthetic outbound Google responses and temporary ledgers.
Navigation tests inject availability/launch results. No live provider request,
native Maps launch, app-data change, key change or real-ledger reset was needed.
Native Kotlin compilation passed in Step 3; this was not repeated because Steps
4-5 do not change native source/configuration.

Commands from the repository root unless noted:

```powershell
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
```

From `mobile/`:

```powershell
node --test
.\node_modules\.bin\expo.cmd export --platform android --output-dir dist/phase9-step5
```

Hermes export used the installed compiler outside the sandbox, as in prior steps.

## Contract coverage and practical limits

| Contract case | Automated evidence | Remaining device evidence |
| --- | --- | --- |
| N01: complete ordered round trip | One/eight deliveries in both URL builders; evaluated sequence retained in cross-stack harness | Explicit eight-delivery native acceptance and restaurant return |
| N02: Apple version compatibility | 18.3/18.4/18.10/later/malformed boundaries | Current iOS Apple Maps and older-iOS fallback |
| N03: browser/unknown transport | Four/eight deliveries select one-destination links without waypoints | Observed browser or native handler behavior on a test device |
| N04: each delivery and restaurant | Every index exports exact coordinates without fixed origin; units remain in source/UI labels | Driver confirms actual building destinations and visible units |
| N05: unavailable/unknown apps | Missing module, failed/false probes, unsupported preference and explicit alternatives | Missing/disabled-app condition on a disposable test setup |
| N06: invalid input and limits | Empty/sparse/oversized routes, bad coordinates/options/apps, encoding and valid boundaries | No malformed live route is required; Google length guard is defensive and not separately forced by a fixture |
| N07: cancellation and races | Awaited dialogs, cancellation, route/selection/preference changes and unmount | Native dialog dismissal and rapid-tap observation; overlap guard is in App, not a service concurrency test |
| N08: failure and retry | Rejection preserves route; repeated launch retains destination; cross-stack usage unchanged | Native retry/foreground behavior |
| N09: route changes and restore | Exact route-bound selection, invalidation, persisted order/sequence recovery and expiry | Background, process restart and recalculation observations |
| N10: preference recovery | Late read/write races, failures, invalid values and retained unsupported choice | Native Settings restart and one-time fallback preference check |
| N11: preserved driver flow | Route timing, unit labels, Eastern/DST clocks, signed confirmations, usage limits and persistence regressions pass | Always-visible metrics and bottom Maps action remain a UI observation |
| N12: platform acceptance | Step 3 Android Kotlin compile and iOS query introspection; final Android JS export | Device/OS/build/Maps-version record; iOS compile and walkthrough |

The Google URL-length guard is retained, but coordinate-only URLs with at most
eight waypoints cannot normally approach 2,048 characters. No test claim is made
for a fabricated over-limit production route. Apple documentation reviewed in
Step 2 gives no numeric unified-URL limit; actual native eight-stop acceptance
must still be observed. Successful URL generation/open promises cannot establish
that an external app accepted every destination.

## User-reported emulator checks

The user reported “good” after the full-route emulator instructions and again
after the Step 4 single-destination walkthrough, then authorized each commit.
These reports are useful acceptance feedback. Exact OS/build/Maps versions,
individual case outcomes and explicit eight-stop results were not supplied, so
this document does not infer a complete device matrix from them.

Step 5 automated validation is complete. Phase 9 native acceptance remains Step
6 work and must not be marked complete solely on these automated results.

## Additional emulator checks for Step 5

No new app behavior was introduced in Step 5. There is no need to repeat the
entire Step 4 walkthrough. Keep the backend, emulator and Metro running, using
the rebuilt Step 3-or-later RouteRunner app. For the remaining boundary checks:

1. **One delivery:** calculate one confirmed test order, choose More → Navigate
   one stop at a time, then tap Next. Expect the restaurant selection immediately.
   Open it; Maps must receive the restaurant without typing an address.
2. **Eight deliveries:** calculate eight distinct confirmed test destinations.
   Open the full route. Check all eight deliveries in the calculated order and
   restaurant last; report any dropped or reordered stop. Then return and check
   that all orders remain. Use synthetic addresses/receipts, not customer data.
3. **Background retention:** select stop two in single-stop mode, go to the
   Android home screen and reopen RouteRunner. Within a still-valid run, expect
   the same selection and orders; no automatic advancement or recalculation.
4. **Process restart:** close/relaunch RouteRunner (do not clear data). Within
   the eight-hour session window, expect saved orders/sequence but no restored
   calculated navigation. Confirm the restaurant and Update route; navigation
   starts in full-route mode and single-stop selection begins at stop one.
5. **Record evidence:** note emulator/Android version, Google Maps version,
   RouteRunner source commit `a56a584`, tested case and observed result. Include
   a screenshot if destinations are missing or a fallback appears unexpectedly.

Actual lookups/calculations consume the configured Google allowance. Destination
selection and handoff add no backend provider calls. Do not change the clock,
disable personal apps, uninstall RouteRunner or clear its data for these checks.
iPhone testing for Google/Apple Maps and the older-iOS fallback remains pending;
Windows Android tests do not substitute for it.

For the full UI walkthrough and native rebuild instructions, see
[Step 4 stop navigation](phase-9-stop-navigation.md) and
[Step 3 recovery](phase-9-navigation-recovery.md).
