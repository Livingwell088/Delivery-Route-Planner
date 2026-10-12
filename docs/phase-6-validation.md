# Phase 6, Step 6: Validation results

Validated October 12, 2026. Steps 4–5 were committed as `220dd4c` on the
existing `template` branch. Step 6 changes remain uncommitted.

Subsequent UX update: the two verification switches were removed at the user's
request. Confirm and add order now provides the single confirmation action.
All 71 tests pass with this flow; unchanged low-confidence fields, invalid data
and duplicates remain blocked. Switch-related checks below describe the original
validation run, before this update.

## Automated checks

- 71 Node tests pass from `mobile` with `npm test`.
- The regression suite includes exact-text replay of all 20 CSV fixture rows.
  This exercises deterministic parsing and expected safety actions independently
  of ML Kit; it is not an image-accuracy claim.
- Android Metro/Hermes export passes. Command:
  `npx expo export --platform android --output-dir dist/phase6-validation`.
- Changed JSX passes Babel parsing; Git whitespace checks pass.

## Actual Android OCR run

All 20 synthetic PNGs were imported through the app's image picker and read by
ML Kit on `Medium_Phone_API_35` / `emulator-5554`. No-text recovery used the
existing text-free Android icon background asset as a negative case.

The first run exposed destructive cropping of already framed imports. After
fixing that path, all 20 images were rerun. Receipt 019 was additionally rerun
after adding bounded same-row date/time pairing. Results in
`phase-6-validation-results.csv` describe those final extraction runs, before
any manual correction or acceptance. A subsequent duplicate rescan of 019 is
excluded from the extraction metrics.

| Outcome | Count |
|---|---:|
| Driver confirmation required | 13 |
| Correction/rescan required | 7 |
| Accept band (>=0.90) | 0 |
| Exact complete delivery destination extracted | 14 / 20 |
| Exact complete destination among ZIP-bearing receipts | 14 / 17 |
| Correct placed date/time after same-row fix | 20 / 20 |
| Wrong displayed delivery destinations in this run | 0 |
| Incorrect results shown as ready | 0 |

The seven correction cases were 005, 008, 009, 010, 013, 015 and 017:

- 005: OCR read the suffix as `VWAY`; no complete address was accepted.
- 008: OCR omitted the last ZIP digit; no ZIP was invented. Suite preservation
  also passed the earlier cropped-image run and the deterministic regression.
- 009: address/unit/region text was readable in the full-image OCR output, but
  the conservative spatial grouping did not form a complete candidate.
- 010/013/017: ZIP was absent in the source, so manual correction was required.
- 015: the extracted address/time were correct, but missing nearby delivery
  evidence kept address confidence at 0.57. Unchanged acceptance was blocked.

The readable-but-blocked cases are known false negatives. They should be
investigated with captured OCR geometry and real receipts before relaxing
thresholds. This validation establishes visible recovery for the current test
set, not calibrated probability estimates or general POS coverage.

## Driver workflow checks

- Correct address/time reached the confirmation form; separate Suite 200
  survived the initial actual OCR run and draft handoff.
- Save was disabled with no verification and with only one field verified.
  Both verifications enabled it for a usable draft.
- Editing the synthetic order identifier reset both verification flags and
  disabled Save. Re-verification allowed a successful save.
- Cancelling a draft did not add an order or mark the receipt accepted.
- Saving receipt 019 and rescanning it displayed Duplicate receipt and disabled
  normal continuation.
- No-text OCR displayed a clear failure with Retake, Enter manually and Cancel.
  Manual entry opened blank address/time fields and successfully saved a
  destination without ZIP only after both fields were entered and verified.
- Repeating final manual address/time under a different identifier was blocked
  at save; order count remained one. Changing the time by six minutes, then
  re-verifying, saved a second order at the same destination.
- Test mode still changed the home action to Add mock receipt and opened the
  existing editable mock confirmation form. Image import remained usable.

All test orders were synthetic and local. Route optimization was not submitted.
The app's orders/fingerprints remain session-scoped; restarting the development
app clears them. Android floating input controls and a development warning toast
intercepted some test taps; completing text entry and closing the toast allowed
the checks to proceed.

## Fixes found during validation

1. Preserve the entire imported image. Camera capture still uses its framing
   crop; imported receipts no longer lose edge digits or headings.
2. Pair adjacent date/time blocks on the same printed row even if OCR reports
   the time slightly higher. Bound vertical drift and horizontal gap to avoid
   remote-column pairing; add positive and negative regression cases.
3. Show actionable, plain-language warnings instead of all parser diagnostics.
   Keep full evidence in the review data and label original scan warnings.
4. Reject impossible manual calendar dates, 24:00 rollover, ambiguous date
   strings and missing timezone. Accept valid ISO times and leap days.
5. Clear stale save errors when draft fields/review flags change.

## Remaining verification limits

Additional anonymized receipt photographs and POS families remain needed.
Physical camera behavior and felt vibration need a phone check; the emulator
fixture run did not exercise the accept band. The confirmation/correction
bands and high-confidence boundary are covered by automated policy tests.
Geographic existence is not established by parser or manual format validation.
No cloud/LLM fallback was added.

The completion criterion passes for the current synthetic validation set:
questionable results are visibly blocked or require explicit review, and
missing/unreadable data has a working correction or rescan path.

## Real-photo order-number regression

The order-number parser now permits single-digit numbers and uses the number's
position beside the printed date instead of fixed percentages of the photo.
Its height tolerance accommodates perspective and OCR bounding boxes while
retaining the known-merchant, date-row and right-column checks.

Native Android ML Kit checks on the five supplied October 2 photographs detected
the printed numbers: IMG_3720 = 3, IMG_3721 = 1, and IMG_3722/3723/3724 = 2.
The angled IMG_3724 still needs time correction because OCR reads an incomplete
clock value. These checks cover order-number extraction; other receipt fields
can still need correction. The photographs remain outside the tracked fixtures.
