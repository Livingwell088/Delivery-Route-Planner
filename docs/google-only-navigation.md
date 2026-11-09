# Google-only navigation (temporary product choice)

November 9, 2026. The user chose Google Maps only while keeping Apple navigation
implementation available for possible future work. This supersedes older Phase 9
instructions offering Apple Maps as a user-selectable app.

## Behavior

- Settings lists Google Maps only on Android and iOS.
- Stored Apple/unknown preferences resolve to Google in memory. Reading does not
  overwrite storage; explicitly selecting Google saves the supported value.
- Unsupported selections cannot be saved through the preference service.
- The handoff gate normalizes stale Apple requests to Google, so an old preference
  cannot launch Apple or probe it as an alternative.
- If native Google Maps is unavailable, only the one-stop Google Maps link and
  cancellation remain available. No Apple fallback is offered.
- Apple URL builders, capability helper and existing native query declarations
  remain dormant. Re-enabling them requires a separate provider/licensing decision.
- Google full-route, selected-stop and restaurant-return behavior is retained.
  No provider credentials, backend configuration or usage ledger changed.

This is JavaScript/UI work: reload the installed app through Metro. No native
rebuild is required for an app already containing the Phase 9 native adapter.

## Verification

- 184 mobile tests passed, including old Apple preference restoration, unsupported
  selection rejection, Google-only alternatives and direct stale-Apple handoff on
  the iOS path. Existing Apple-builder tests continue to cover dormant code.
- Both isolated Phase 7 and Phase 8 reordering HTTP acceptance tests passed.
- Android Hermes export: `mobile/dist/google-only-navigation` (ignored).
- No live provider calls or real external navigation launches were performed.
  iPhone UI/native acceptance remains a manual check.

## Manual checks

1. Keep backend, emulator and Metro running. Press **r** in the Metro terminal to
   reload. Open Settings: only Google Maps should be listed.
2. Calculate a route and tap the bottom Open in Google Maps action. Expect the
   calculated delivery sequence and restaurant return in Google Maps.
3. Return, choose More → Navigate one stop at a time, open a delivery and then
   select Return to restaurant. Each handoff should target the selected building;
   returning must not advance selection or remove orders.
4. Restart RouteRunner and reopen Settings. Expect Google still selected. Do not
   clear app storage to simulate an old Apple preference; automated tests cover it.
5. On an iPhone build, repeat Settings and navigation checks. Apple Maps must not
   appear even though the device supports it. If Google is unavailable, expect only
   a Google one-stop link or Cancel; do not uninstall personal apps to induce this.

Real address lookups/calculations consume the configured allowance; destination
selection itself does not make backend provider calls. This change addresses the
identified Apple handoff path, not all privacy, licensing or release requirements.
