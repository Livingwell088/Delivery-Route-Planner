# Phase 6, Step 5: Driver correction and duplicate lifecycle

The recognition screen offers selectable address/time alternatives, updates
confidence after selection, and opens correction for any successful OCR result,
including results with missing candidates. Failed/no-text OCR offers manual
entry. Correction drafts preserve available selected fields; unavailable fields
start blank rather than using a merchant or inferred replacement.

Receipt drafts retain original values, score/evidence, required correction
fields and two driver verification flags. Field edits reset both verification
flags. Low-confidence address/time fields must change meaningfully before save:
case/whitespace-only address changes and equivalent time-zone representations
do not resolve uncertainty. When ambiguity penalties make the overall score low,
at least one extracted value must change or the driver must rescan/select a
better candidate. Edits do not increase the original OCR confidence.

Every receipt requires explicit destination/unit verification and placed-time
verification. The final address must include a house number/street, city and
state, with optional ZIP. Drivers may omit an unprinted ZIP after verification;
the parser still does not produce partial address candidates or invent ZIPs.
The form explains required corrections, keeps warnings visible, and offers
rescan/cancel. App save validation repeats the checks independently of disabled
buttons. This validates format and driver review, not geographic existence.

Receipt fingerprints are now based on the full formatted destination and
minute-level time, allowing scans and edited drafts to use the same identity.
Only successful save records fingerprints, including the original scan identity
and final corrected identity. Cancel, failed validation and entering confirmation
do not record them. Duplicate final destination/time blocks save even if the
generated order ID differs; later times at the same destination remain distinct.
Fingerprints remain session-scoped as before.

Validation: 48 tests pass, including high/medium verification, unchanged low
confidence rejection, actual address/time correction, empty OCR/manual entry,
missing ZIP verification, missing time recovery, malformed fields and corrected
fingerprint identity. Changed JSX files pass Babel syntax parsing. Live Android
workflow behavior has not yet been checked.

## Emulator acceptance sequence for Step 6

1. Import 008/009: select candidates, verify suite/room, and check the draft.
2. Import a missing-ZIP fixture: open Correct receipt details, enter the full
   destination without inventing ZIP, verify both fields and save.
3. Import unreadable/no-text material: Enter manually must open a blank draft.
4. On an uncertain extraction, toggle verification without correcting the weak
   field: save stays blocked. Correct it, verify again and save.
5. Change a field after verification: both verification switches reset.
6. Cancel a draft and scan it again: it must not be marked already added.
7. Save a corrected order and rescan: duplicate warning must appear; attempting
   to save identical final details through correction must be blocked.
8. Scan another receipt for the same destination at a later time: allow it.
9. Rescan/cancel from correction; check mock test mode and image import still work.

Steps 4–5 remain uncommitted until requested. Phase 6 completion still requires
the image/OCR and emulator validation of Step 6.
