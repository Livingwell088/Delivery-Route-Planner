# Phase 8 Step 3: Scan next and safe rescan replacement

Step 2 is committed as `4a4b4fc` on `endtoend`. Step 3 remains uncommitted for
review. This step changes the single-driver receipt workflow; it does not add
dispatcher/multi-driver functionality or automatic route recomputation.

## Driver behavior

Orders now opens the scanner directly through **Scan receipt** / **Scan next
receipt**, including immediately after a successful confirmation. It no longer
sends the driver through Home. A successful save returns to Orders with an
added/replaced notice and the next-scan action.

Each order has **Rescan** and **Remove** controls. Rescan targets that specific
order while retaining its original data and receipt identities. Capture, OCR,
correction, location lookup and confirmation use a separate draft. The review
screen identifies the original order and offers **Confirm and replace order**.
Address confirmation must still verify the selected Google candidate and preserve
separate unit data. Eastern clock-only placed-time editing is unchanged.

Canceling capture, photo preview, OCR or review returns to the initiating flow
without changing active orders or calculated route validity. OCR processing now
has a Cancel action, and photo preview has an explicit Cancel action. Header
navigation discards the in-progress receipt without changing the saved run.
Retaking stays within the same replacement operation. A failed lookup/confirmation
keeps the draft available and leaves the original active order untouched. An app
restart retains the saved original, not an unfinished draft.

Only successful confirmation swaps the target order and its fingerprints. A
corrected order number can change its ID; the replacement retains its position in
both the active list and any existing desired route sequence, including manual
sequence source. Route estimates are invalidated and require explicit calculation.
The UI's reorder/evaluate controls remain Step 5.

## Duplicate, limit and persistence rules

- Recognition excludes fingerprints owned exclusively by the replacement target.
  The same receipt can therefore be rescanned for that order. Other orders'
  fingerprints and unowned legacy protections remain active.
- Save checks both the reviewed/corrected fingerprint and original OCR fingerprint
  against every other order. Scanning B to replace A cannot bypass protection by
  changing B's order number/address on the correction screen.
- Order IDs are trimmed, preserving leading zeros. Duplicate IDs are checked
  against other active orders, and the backend-reserved ID `start` is rejected.
- Checks run before confirmation and again against the latest run before the
  swap. A removed/edited target cannot be overwritten by an old receipt entry.
  The existing synchronous save guard prevents repeated confirm taps from
  starting concurrent saves; duplicate checks also prevent a second append.
- Eight active orders is the limit. New scans and mock additions are blocked
  before capture and checked again before save. Replacement and removal remain
  available at capacity. Removing an order enables adding again.
- Removal releases only the removed order's exclusively owned fingerprints.
  Shared and unowned protections remain. A later re-add of the removed receipt is
  allowed when it does not duplicate another active order.
- Successful changes use the existing serialized session writer to persist the
  orders, fingerprints and sequence preference. No receipt image/OCR payload or
  route timing is added to storage. The existing session/confirmation expiry
  limits remain in place.

Beginning/canceling a scan or removing an order adds no Google routing request.
Review still performs normal address lookup; rescan can therefore consume existing
geocoding allowance even if later canceled. Confirmation itself does not make a
new Google request. Reoptimization remains explicit, using the existing safeguards.

## Verification — October 19, 2026

- **144 mobile tests passed**, including 11 new receipt-entry transaction cases.
- **246 backend tests passed**, including a new cross-stack receipt acceptance
  case and all prior Phase 7/Phase 8 checks.
- The new HTTP acceptance case uses production mobile draft/duplicate/review/
  confirmation/transaction/session/route services. It confirms three synthetic
  orders, checks failed confirmation and duplicate rejection, replaces an ID/unit/
  placed time in position, evaluates the preserved sequence, restores a saved
  removal, and re-adds that receipt exactly once.
- Google outbound transport is mocked. The new acceptance case records six mock
  geocoding attempts and two 4-by-4 matrices (38 synthetic ledger units) in its own
  temporary database. It uses a temporary HTTP port and does not touch backend
  8002, the real usage ledger, credentials or phone orders.
- Android JavaScript/Hermes export passed (`mobile/dist/phase8-step3`, ignored).
  The installed compiler ran with approved execution outside the sandbox.
- `git diff --check` passed. The existing Starlette/httpx warning remains.
- Native camera/OCR/interaction and iOS walkthroughs below were **not performed**.
  Synthetic scan-result tests are not a substitute for ML Kit/device verification.
  No live Google calls were made during implementation.

Run the new checks independently:

```powershell
# Repository root: actual mobile services over isolated HTTP, Google mocked.
.\.venv\Scripts\python.exe -m pytest tests/test_phase8_receipts.py -q -p no:cacheprovider

# From mobile/: receipt-entry transaction checks.
node --test --test-reporter=spec test/receiptEntry.test.js
```

Full checks are the standard root pytest command, `node --test` from `mobile/`,
and `.\node_modules\.bin\expo.cmd export --platform android --output-dir dist/phase8-step3`.
Do not point `mobile/scripts/phase8-receipts.mjs` at a live backend; run it only
through its isolated Python harness.

## Exact native manual checks and expected results

Use the startup guide: backend on **8002**, Metro on **8081**, installed native
RouteRunner (not Expo Go). Reload the app for these JavaScript changes. Use
synthetic receipt fixtures and correct old fixture dates/times to the current run
through the existing receipt review if needed. Successful Google lookups use
allowance; keep the real usage ledger and ignored keys intact.

1. **Consecutive scanning.** Scan and confirm distinct receipts A, B and C. After
   each save expect Orders, one added notice, and **Scan next receipt**. Tap it:
   expect the scanner immediately, with no Home screen in between. After three
   confirmations expect exactly three active orders. Repeated confirm taps must
   not add another copy.
2. **Cancel without replacement.** Calculate a route, return to Orders, tap A's
   **Rescan**, then Cancel at the camera. Repeat after taking/selecting a photo,
   during OCR if possible, and at final review. Expect A/B/C unchanged each time
   and the previously calculated route still reviewable. If OCR finishes before
   Cancel can be tapped, record that processing cancellation was not observed.
   Opening Orders or Settings through the header also abandons the draft safely.
3. **Same-receipt rescan and retake.** Tap A's Rescan and scan its own original
   receipt. Expect it not to be blocked as another order's duplicate. Review
   should say **Replace order #A**. Tap Rescan/Retake again, then capture again:
   expect the replacement target still to be A. Cancel: original A remains.
4. **Confirm corrected replacement.** Rescan A and correct its printed order
   number to a distinct ID, destination/unit if needed, and placed clock. Review
   and confirm the selected Google location. Tap **Confirm and replace order**.
   Expect three orders, corrected A in the same active-list position, B/C unchanged,
   separate unit retained, and calculation required. Recalculate explicitly:
   expect the corrected order once. Manual sequence retention is covered by
   automation until Step 5 exposes reorder controls.
5. **Other-order duplicate.** Rescan A using B's receipt. Expect a duplicate
   warning or rejection at save and both originals intact. Try **Correct receipt
   details**, changing the proposed order number/address: the original B receipt
   identity must still prevent replacement of A. Cancel to return to Orders.
6. **Failed confirmation and recovery.** Rescan A; reach review with a selected
   destination. Stop the backend, then confirm. Expect a connection/timeout error
   with A still active and the draft retained. Restart the backend, retry lookup
   and select the destination as needed, then confirm once. Expect one replacement
   and no added duplicate. Canceling instead must leave original A intact.
7. **Removal and restart.** Remove B and fully close/reopen the app while the
   saved run remains valid. Expect B absent and replacement A's corrected ID,
   unit and placed time retained. Scan B's old receipt again: expect it to be
   addable once without stale duplicate rejection. Route estimates still require
   recalculation after restart.
8. **Capacity.** Build a run of eight distinct orders (Home test mode can speed
   this check; confirm each destination). Expect Scan next disabled with the
   eight-order message, and Home's add/scan action disabled too. Expect Rescan,
   Remove and Optimize still available. Replace an order: count stays eight.
   Remove one: scan/add becomes available and the next confirmation restores eight.
9. **Restart during an unfinished replacement.** Start rescanning A but do not
   confirm. Fully close and reopen. Expect the original saved A, not the unfinished
   replacement; no order is lost and no duplicate is added.

Record native checks separately from automated results. Android export does not
verify camera permissions, tap targets, layout or an APK installation. iOS native
interaction and navigation still require macOS/iPhone testing.
