# Phase 9 Step 3: navigation availability and launch recovery

October 20, 2026. Step 2 is committed as `59548db` on `navigation`.
Step 3 adds availability handling, explicit fallback choices and preference race
protection. Point-to-point progression remains Step 4; native acceptance remains
Step 6.

## Behavior

Android checks a package-scoped directions intent for
`com.google.android.apps.maps` through a small `RouteNavigation` native module.
It opens that same package explicitly, so a successful generic HTTPS handler is
not mistaken for native Google Maps. Missing/disabled Maps is unavailable; a
missing module (older installed RouteRunner build) or failed check is unknown.
The module checks availability again when opening and restricts input to HTTPS
Google Maps directions URLs. It launches no activity during a capability check.

The local Expo plugin declares package visibility, copies the Kotlin source into
the generated Android project and registers its React package. React Native's
existing Linking API has no package-targeting option, which is why this narrowly
scoped adapter is necessary. No package dependency was added. Registration fails
explicitly if a future native template no longer matches; repeated prebuilds do
not duplicate registration or queries.

iOS probes `comgooglemapsurl://` for Google and `maps://` for Apple, with both
schemes declared by the plugin. Google native launch uses the documented
`comgooglemapsurl` wrapper around its directions URL. Apple retains unified HTTPS
links on supported iOS and legacy one-stop links elsewhere. Availability is checked
on each tap. Native app destination acceptance still requires device observation.

Unavailable/unknown preferences offer explicitly selected alternatives, followed
by Cancel. Only native options whose checks succeed are offered, plus a Google
Maps one-stop universal link. That link may open a browser or an installed app;
the UI does not promise a browser or full-route handoff. No temporary alternative
rewrites the stored preference. A failed launch offers Retry, Other options or
Cancel, without automatic retries or recalculation.

Fallback acknowledgement now waits for Continue. Cancel, Android Back/outside
dismissal, or a missing affirmative response never launches. Current route,
freshness, preference, optional selection and mounted state are checked after
each asynchronous capability check/dialog and immediately before launch. Existing
App-level protection still prevents overlapping navigation taps. Failure/cancel
preserves orders, sequence and valid predictions.

Settings offers Google on Android and both providers on iOS. A restored Apple
preference on Android remains stored, with an explanation and explicit selection
to change it. Invalid stored values use Google. Preference writes are serialized;
late restore results cannot overwrite a newer selection, and an obsolete write
failure cannot show an error for a newer successful choice. Failed reads retain
the usable choice; failed saves keep it in memory and show the existing notice.

The bottom Maps button and always-visible order metrics remain unchanged.
At this intermediate step, fallback still opens only the first delivery. The
notice states this explicitly. The selector, continuation and restaurant-return
controls are Step 4 work; Phase 9 is not complete yet.

## Verification

- 177 mobile tests passed, including availability outcomes, exact launch adapter,
  explicit alternatives, awaited/canceled fallback, stale state during probes and
  dialogs, failure/retry, preference races, plugin idempotence and iOS configuration
  introspection.
- 250 backend tests passed, including the isolated cross-stack reordering/recovery
  harness with mocked availability and launch. The existing Starlette/httpx warning
  remains. No live Google provider requests or real navigation launches were used.
- Android Hermes export passed at ignored `mobile/dist/phase9-step3`.
- Android prebuild completed; generated source, package registration and package
  visibility were inspected. `:app:compileDebugKotlin` passed, including the new
  native adapter. Existing dependency deprecations and ReactPackage interop
  warnings remain. iOS introspection verifies query declarations, not an iPhone build.
- Debug signing certificate matches the already installed Android app. No app
  uninstall, app-data clearing, receipt changes or usage-ledger replacement occurred.

The first prebuild attempt used Expo 57's new default of regenerating native
folders and failed on generated-file permissions. The incomplete generated project
was subsequently backed up and regenerated successfully; the local SDK path was
restored. Backups/build outputs remain ignored under `mobile/dist`. Use
`--no-clean` for future incremental prebuilds with this SDK.

## Rebuild and pending manual checks

These changes require native rebuilds. Metro reload/Hermes export alone cannot
add Android's adapter or iOS query declarations. From `mobile/`:

```powershell
.\node_modules\.bin\expo.cmd prebuild --platform android --no-install --no-clean
npm run android
```

On macOS/iPhone, apply the equivalent iOS prebuild using `--no-clean`, then use
`npm run ios` with the existing configuration. Do not replace environment files
or keys. Do not uninstall the existing app to test recovery.

After Step 4, run the full driver checklist together. Step 3-specific observations:

1. With Google Maps available, open a calculated route and observe actual native
   launch. On Android verify the rebuilt app is used, not an older installed build.
2. On a disposable test device/profile where Maps is absent/disabled, expect an
   explanation and explicit alternative/Cancel. Do not clear real app storage or
   remove personal navigation data to create this condition.
3. On older iOS, Cancel the one-stop notice: nothing launches. Continue opens the
   selected building. Repeat dismissal/Android Back on applicable dialogs.
4. Return from Maps and retry: orders, sequence and estimates remain; no stop is
   marked delivered. Rapid tapping must not create overlapping handoffs.
5. Change the preferred app, restart and verify it restores. One-time fallback
   must not change that saved choice. On iOS verify both installed apps separately.
6. Repeat route expiry/change during a pending dialog; stale navigation must not
   launch. Injected tests cover this deterministically; device UI behavior remains
   a separate observation.

Record device, OS, RouteRunner build, Maps version and observed behavior. A
successful open promise does not establish that every waypoint was accepted.

## References

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) and
  [config plugins](https://docs.expo.dev/config-plugins/plugins/).
- [Google Maps Android intents](https://developer.android.com/guide/components/google-maps-intents):
  package targeting and resolution checks.
- [Google iOS URL scheme](https://developers.google.com/maps/documentation/urls/ios-urlscheme):
  native availability and supported URL wrapper.
- [React Native 0.86 Linking](https://reactnative.dev/docs/0.86/linking) and
  [Android native modules](https://reactnative.dev/docs/0.86/legacy/native-modules-android).
