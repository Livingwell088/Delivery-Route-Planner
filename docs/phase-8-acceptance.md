# Phase 8 Step 7: final acceptance

October 20, 2026. Steps 1–6 are committed on `endtoend`; Step 6 is `2e754c6`.
Step 7 records final automated acceptance and updates the startup documentation.
Automated acceptance passes. Native driver acceptance remains pending.

## Current driver flow

1. Start the backend on 8002 and the installed native app using the
   [startup guide](startup-guide.md). Restart an older backend after code updates.
2. Scan a receipt, review the extracted address, unit, order number and Eastern
   placed clock, select/confirm the destination, and save. Repeat with
   **Scan next receipt**, up to eight orders.
3. Confirm the restaurant and select **Optimize route**. Orders stays compact;
   each order's **•••** menu contains Rescan and Remove.
4. The route displays each address, placed clock, arrival, predicted order age,
   leg drive and cumulative drive. **Details** expands return timing and assumptions.
   Google durations exclude live traffic; stop service time is zero.
5. **Edit stops** exposes movement/removal controls. **Update route** calculates
   that chosen sequence. **More → Optimize again** explicitly chooses a new one.
   Changes invalidate prior predictions and navigation until recalculated.
6. The Maps action is at the bottom. It exports the calculated sequence and
   restaurant return. Actual Maps acceptance must be checked on a device.
7. Rescan replaces an order only after successful review/confirmation. Failure or
   cancellation preserves the original. Saved orders and sequence restore within
   the existing eight-hour validity; route predictions require fresh calculation.

There is no separate Review stop order step. Expiry, failed updates, storage
retries and Maps launch failures preserve orders and the chosen sequence.
No dispatcher or multi-driver functionality is included.

## Automated evidence

Final full-suite run: **250 backend tests and 160 mobile tests passed**, zero
failures. The backend suite runs real local HTTP against production mobile
service modules, with only outbound Google responses mocked:

| Harness | Coverage |
| --- | --- |
| `test_phase7_acceptance.py` | Signed location confirmations, persistent session/backend restart, navigation URL construction, usage accounting and zero allowance |
| `test_phase8_timing.py` | Optimization versus fixed sequence, authoritative placed/departure/arrival/age/return arithmetic, directed matrix, invalid requests and Eastern DST boundaries |
| `test_phase8_receipts.py` | Three receipts, duplicate protection, failed rescan, atomic replacement, units/time correction, sequence preservation and remove/restore/re-add |
| `test_phase8_reordering.py` | Manual movement, failed update/retry, exact evaluated sequence, removal/addition, restore, explicit reoptimization, navigation failure/retry, persistence retry and expiry |

Mobile tests separately cover receipt parsing against synthetic extracted-text
fixtures, state cancellation/races, response validation, review formatting and
storage/navigation recovery. The HTTP receipt harness starts with synthetic
extracted candidates; these checks do not execute camera capture or native OCR.

All acceptance provider calls use synthetic responses, temporary ports and
temporary SQLite ledgers. No live Google calls, real customer receipts or external
Maps launches were used. The existing Starlette/httpx deprecation warning remains.

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider
Set-Location mobile
node --test --test-reporter=spec
.\node_modules\.bin\expo.cmd export --platform android --output-dir dist/phase8-step7
```

Android Hermes export passed at `mobile/dist/phase8-step7` (ignored), and
`git diff --check` passed. The export checks bundling, not installation or native
interaction.

## Remaining native acceptance

Use synthetic fixture images and the installed native app, not Expo Go. Successful
live address lookups and route updates consume the configured Google allowance.
Preserve the real usage ledger and existing keys.

- Capture/import three receipts; verify native OCR, address/unit/time correction,
  destination selection and scan-next transitions.
- Cancel and fail a rescan, then successfully replace the same order. Confirm no
  duplicate, no premature removal and the corrected unit/time on the route.
- Optimize, move a stop, update, and verify order details remain visible with the
  Maps button at the bottom. Open Google Maps and verify destinations and return.
- Stop the backend during an update, restart and retry. Confirm orders/sequence
  survive and only the successful current response becomes navigable.
- Close/reopen within session validity; verify restored orders/sequence and fresh
  route calculation. Check foreground expiry using the detailed
  [recovery checklist](phase-8-recovery.md).
- On supported iOS, verify Apple Maps and the older-iOS fallback separately.
  Android export and URL tests do not establish iOS acceptance.

Record device, OS, build and observed results before declaring native acceptance
complete. Storage fault banners and actual Maps launch failures also remain
native checks; injected automated failures establish service behavior only.
