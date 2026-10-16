# Phase 7 Step 7: Delivery acceptance results

Step 6 is committed as `bdac8ba`. Step 7 changes remain uncommitted for review.
Automated acceptance passed. Final native-device acceptance remains pending;
this report does not declare the delivery mode fully device-verified.

## What changed

Added a cross-stack acceptance harness that runs actual JavaScript mobile
services against a real local HTTP backend. Only Google's outbound transport is
mocked. Each phase launches a new Node process; the backend is stopped and
recreated between phases with the same temporary SQLite usage database.

The flow found and fixed an address-confirmation issue: outer spaces in the
editable address were preserved by the mobile draft, while the API trims them.
The client now compares the confirmed original input using that same outer trim,
while edits to the actual destination continue to invalidate selection.

Navigation URL generation was separated into a pure `navigationLinks.js` module
so the same production builders can be verified by Node and by the cross-stack
flow. The existing React Native wrapper still supplies the real device Platform;
Google/Apple handoff behavior is unchanged.

## Automated evidence

| Scenario | Result |
| --- | --- |
| Mobile lookup over HTTP and clean-result selection | Passed |
| Original address with leading/trailing spaces | Passed; confirmation issue fixed |
| Ambiguous results require explicit candidate selection | Passed |
| Apartment/suite survive confirmation and returned route | Passed |
| Invalid address cannot become a confirmed mobile order | Passed |
| Backend verifies selected Place IDs and requests the directed matrix | Passed |
| Every order appears exactly once with its complete address snapshot | Passed |
| Eastern time formats as a clock with AM/PM | Passed |
| Google export contains route-order coordinates and confirmed origin/return | Passed |
| Apple multi-stop export preserves canonical labels, units and origin/return | Passed |
| Older-device Apple fallback targets only the first stop and flags fallback | Passed |
| Session serialization/restoration retains three orders | Passed |
| Restarted backend accepts unexpired signed confirmations | Passed |
| Usage counters survive backend recreation | Passed |
| Restored route requires no fresh geocoding | Passed |
| Changed unit is rejected before provider usage | Passed |
| Zero allowance blocks routing without changing orders or counters | Passed |

The cross-stack fixture performs five mocked geocoding attempts and two mocked
4-by-4 matrices. Its ledger records 37 units; the blocked phase adds none. No real
Google calls, credentials, customer orders, receipt images or navigation app
launches are involved. It uses a temporary backend port and temporary storage;
the running backend on 8002 and real usage ledger are not modified.

Final verification on October 16, 2026:

- **215 backend tests passed**, including the cross-stack test.
- **120 mobile tests passed**, including four new navigation-link checks.
- **Android Hermes export passed**, output `mobile/dist/phase7-step7` (ignored).
- `git diff --check` passed.
- The existing Starlette/httpx deprecation warning remains.

Run all automated checks from the repository root and mobile directory:

```powershell
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
Set-Location mobile
node --test --test-reporter=dot
```

Run only cross-stack acceptance from the root:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_phase7_acceptance.py -q -p no:cacheprovider
```

Node.js must be available on PATH; without it, that particular pytest check is
explicitly skipped. The mobile runner is intended only for this mock harness;
do not point it at a production backend.

## Remaining native walkthrough

Restart the backend and reload RouteRunner using the [startup guide](startup-guide.md).
These device checks are not automated by the Node/HTTP harness:

1. Scan a receipt and inspect the review screen. Expect clock-only Eastern time,
   readable warnings, one display of city/state/ZIP, and a separately preserved
   unit. Correct uncertain receipt fields, select a destination if prompted and
   confirm. Expect exactly one order added.
2. Add a second order, close and reopen RouteRunner. Expect both confirmed
   orders restored with their original placed times and units.
3. Review the restaurant and optimize. Expect each order exactly once and a
   sensible route. Open Google Maps and verify actual destinations and stop
   order. On a supported iPhone, repeat with Apple Maps; on older devices expect
   the existing first-stop fallback notice. The URL checks above do not prove
   external apps accept or navigate the entire route on every device.
4. Stop the backend during a lookup or route submission. Expect preserved
   draft/orders and a recoverable connection error. Restart it, retry, and check
   that no duplicate order is added.
5. Remove an order, reopen the app, and confirm removal persists. Scan it again;
   expect it to be addable without stale duplicate-receipt rejection.

Successful lookup/route device checks use Google usage. The cutoff can be checked
without provider usage using the [Step 6 zero-allowance instructions](phase-7-usage-controls.md).

## Scope and handoff

This completes the automated acceptance work for the seven delivery-mode steps.
Native walkthrough and previously documented deployment/privacy/provider-policy
checks remain release tasks. Dispatcher mode has not started. Its order-age,
driver-count and travel-time allocation work can follow delivery-mode acceptance.
