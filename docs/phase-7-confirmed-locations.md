# Phase 7, Step 4: Confirmed locations and active runs

Step 3 was committed as `fbf2f51`. Step 4 remains uncommitted for review.

## Backend confirmation

`POST /addresses/validate` returns a `lookup_reference` when Google supplies
usable candidates. It binds the exact input, separate unit and usable provider
candidates for 15 minutes. Lookup alone does not confirm a location.

After reviewing the result, submit this to `POST /addresses/confirm`:

```json
{
  "address": "455 Main St, Worcester, MA 01608",
  "lookup_reference": "copy from the lookup response",
  "candidate_id": "copy the chosen candidate_id"
}
```

The response is an `Address` containing canonical text, original input, separate
unit, coordinates and `validated_location` with Place ID, timestamps and an
eight-hour `validation_reference`. Confirmation does not call Google again.
Unusable candidates cannot be confirmed; usable candidates marked for review can
be confirmed after explicit selection.

References use HMAC SHA-256 with a domain-specific key derived from the server-only
Google credential. They contain readable address snapshots, not secrets; they
are not encrypted. Verification survives backend restarts without a new database
or signing-secret setup. Rotating the Google credential invalidates references.

In Google mode, order creation/update and optimization reject missing, expired,
forged or changed confirmations with HTTP 422 `location_review_required`. The
gate checks the restaurant and every order before the matrix service runs.
Changing raw text, canonical text, unit, coordinates, Place ID or validity
metadata invalidates the reference. Development estimate mode remains an
explicit offline test seam and cannot issue Google confirmations.

## Mobile behavior

- Final order confirmation calls the backend before adding the order or duplicate
  fingerprints. Failure preserves the draft and retries lookup. Repeated taps,
  edits and navigation while saving are blocked.
- Orders carry the backend-issued address through storage, requests and returned
  stops. Canonical addresses and units display once.
- Orders checks the restaurant through the candidate review UI. Submitting the
  route confirms the selected starting location. Candidates requiring review
  need selection; unavailable lookup blocks submission.
- Confirmed restaurant coordinates are used for map previews and Google navigation
  exports; Apple navigation uses its canonical address.
- Valid references avoid another geocoding call during optimization. Expired
  references refresh only to the same Place ID, unchanged unit and a single clean
  result. Changed or ambiguous results require removing and adding the order
  again. A server rejection triggers fresh verification on the next submission.
- Removing an order releases its receipt fingerprints so it can be scanned again.

Active orders and duplicate fingerprints use versioned AsyncStorage key
`active-deliveries-v1`. Stored orders contain only order number, address snapshot,
placed timestamp and receipt fingerprints. Images, OCR text, review candidates,
drafts and route results are not persisted. Writes are serialized; hydration
finishes before the user can add orders. Storage failures show an alert.
AsyncStorage is local, unencrypted storage.

Runs older than eight hours, runs containing expired confirmations, malformed
data and unknown versions are discarded on the next launch with an alert.
Expiry is checked on read; no background deletion service is installed. The
restaurant is reviewed again after restart. Backend `/orders` remains in memory;
mobile persistence does not change that endpoint's restart behavior.

## Verification

- 157 backend tests passed: forged references, changed fields, expiry, key
  rotation, server restart, candidate binding and route gate ordering.
- 110 mobile tests passed: storage recovery, serialized writes, confirmation
  payloads and safe refresh behavior, alongside existing receipt tests.
- Android Hermes export passed (`mobile/dist/phase7-step4`, ignored output).
- Live Google check on October 16, 2026: restaurant and Worcester City Hall lookup
  and confirmation returned 200; a one-order route returned 200 with one stop and
  10 driving minutes. A changed coordinate returned 422 before routing. This used
  two successful geocoding calls and one 2-by-2 matrix request. An earlier probe
  of the old running server used one additional geocoding call.
- Native interaction/restart recovery still needs the walkthrough below. Port
  8002 was serving previous code during the probe; restart it before mobile tests.

## Manual walkthrough

1. Restart the backend using the [startup guide](startup-guide.md), then reload
   the app. Add an order, select its destination if needed, and confirm. Expect
   one saved order with canonical address and unit once.
2. Close and reopen the app. Expect the same orders, placed times and destinations
   on Orders. Drafts and the previous route are not restored.
3. Review the restaurant on Orders, select a result if prompted, then submit.
   Expect the ordered route and the selected restaurant as its origin.
4. Restart only the backend and submit again. Expect existing confirmations to
   remain valid while the Google credential is unchanged.
5. Stop the backend while confirming. Expect an error, preserved inputs and no
   saved order. Restart it and retry; expect exactly one order to be added.
6. Remove an order, restart the app, and scan it again. Expect removal to persist
   and the same receipt to be addable again.

Step 5 will change matrix waypoints to Place IDs. The current adapter still sends
confirmed canonical address text; Step 4 establishes provenance and persistence
but does not complete that routing integration.
