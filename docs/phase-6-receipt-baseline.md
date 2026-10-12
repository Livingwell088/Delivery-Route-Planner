# Phase 6, Step 1: Receipt baseline and safety contract

Recorded October 12, 2026 against Phase 5 commit `9036e76`.
Step 1 establishes expectations; runtime behavior is unchanged.

## Verified baseline

`npm test` from `mobile/`: 20 passed, 0 failed.

The fixture matrix below was replayed through the existing address, timestamp,
and confidence services using exact CSV text, a Delivery label, a same-line
US date and 12-hour time, and left-aligned lines 60 pixels apart in a
1000 x 2000 image. Lines begin at y=600. Empty address lines are omitted.
This is an ideal-text parser baseline, not ML Kit output or image accuracy.
All 20 timestamps were found. No image OCR or emulator checks were performed.

Ground truth: `data/fixtures/receipts/ground-truth.csv`. All dates are
2026-08-29, all cities are Worcester, and all explicit states are MA.
File numbers below uniquely identify the corresponding PNG in that directory.

| Receipt | Expected delivery street / unit | ZIP | Time PM | Ideal-text baseline | Phase 6 acceptance check |
|---|---|---|---|---|---|
| 001 | 455 Main St | 01608 | 4:12 | Street found, 0.96 | Reprint must use order time |
| 002 | 799 Main St | 01610 | 4:18 | Street found, 0.96 | Distinguish similar Main St destinations |
| 003 | 486 Chandler St | 01602 | 4:25 | Street found, 0.96 | Blur damage must produce visible uncertainty |
| 004 | 100 Institute Rd | 01609 | 4:31 | Street found, 0.96 | Tilt must not join unrelated lines |
| 005 | 50 Officer Manny Familia Way | 01605 | 4:38 | Street found, 0.96 | Preserve the entire long street name |
| 006 | 2 Southbridge St | 01608 | 4:44 | Street found, 0.96 | Shadow damage must not silently substitute digits |
| 007 | 55 Salisbury St | 01609 | 4:51 | Street found, 0.96 | Preserve house number despite curl |
| 008 | 311 Main St, Suite 200 | 01608 | 4:57 | Suite omitted, 0.96 | Separate-line suite must survive |
| 009 | 455 Main St, Room 206 | 01608 | 5:04 | Room omitted, 0.96 | Separate-line room must survive |
| 010 | 455 Main St | Missing | 5:10 | No address, 0.32 | Recover partial address; disclose missing ZIP |
| 011 | 151 Salisbury St | 01609 | 5:17 | Street found, 0.96 | Distinguish from receipt 007/020 |
| 012 | 50 Foster St | 01608 | 5:23 | Street found, 0.96 | Faded reprint must not invent text |
| 013 | 222 Harrington Way | Missing | 5:30 | No address, 0.32 | Correction/rescan accessible despite missing ZIP |
| 014 | 2 Washington Square | 01604 | 5:36 | No address, 0.32 | Support Square suffix; handle geometry safely |
| 015 | 455 Main St | 01608 | 5:43 | Street found, 0.96 | Same destination, later time is a distinct order |
| 016 | 799 Main St | 01610 | 5:49 | Street found, 0.96 | Alternate template retains delivery/time semantics |
| 017 | 486 Chandler St | Missing | 5:56 | No address, 0.32 | Missing ZIP remains explicit on reprint |
| 018 | 50 Officer Manny Familia Way | 01605 | 6:02 | Street found, 0.96 | Long address damage requires safe review |
| 019 | 2 Southbridge St | 01608 | 6:09 | Street found, 0.96 | Boxed merchant header cannot win as delivery |
| 020 | 55 Salisbury St | 01609 | 6:15 | Street found, 0.96 | Fold/low contrast requires visible uncertainty |

The replay found 14 complete street/unit destinations, two incomplete unit
destinations scored at 0.96, and four missing address candidates. The unit
omissions are known unsafe high-confidence outcomes to fix, even with perfect
text. The three missing-ZIP cases intentionally have no ZIP ground truth;
never fill it by guessing from another receipt or the merchant address.

## Required fields and acceptance contract

- Delivery street and house number, city/state context, and every printed
  suite/room/unit must be preserved. Missing ZIP is a warning requiring review
  or correction; it must not be invented. A driver may explicitly confirm an
  otherwise usable destination without a ZIP after resolving the warning.
- A valid placed date/time and nonempty order identifier are required when
  saving. Phase 6 does not add order-number OCR: the existing generated ID
  remains editable. Order time must be distinguished from payment/reprint time.
- Confidence is heuristic evidence strength, not a calibrated probability.
  Missing required data, unresolved competing destinations, and detected
  dropped unit information override numerical acceptance.
- High confidence accepts extraction and displays it; an order enters the
  list only through the explicit add-order action.
- Medium confidence requires driver confirmation of the selected destination
  and time. Low confidence requires correction of the unresolved information
  or rescan; a generic unchanged Confirm action cannot bypass that requirement.
- Manual corrections retain source/confidence warnings and record resolution;
  typing does not itself increase OCR confidence. Corrected data must validate.
- Alternatives are selectable and selection updates the draft and assessment.
  Empty/no-text scans must offer manual entry or rescan without a dead end.
- Duplicate fingerprints become accepted only when the order is saved.
  Cancellation and failed validation must not consume a receipt; corrections
  must be reflected in duplicate handling.

| Score (before presentation rounding) | Required behavior |
|---|---|
| 0.6999 | Correction or rescan |
| 0.70 | Driver confirmation |
| 0.89 | Driver confirmation |
| 0.8999 | Driver confirmation |
| 0.90 | Accept extraction and display |
| 1.00 | Accept extraction and display |
| Missing/invalid score or required data | Correction or rescan |

## Additional parser/workflow cases for subsequent steps

| Case | Expected check | Existing coverage / gap |
|---|---|---|
| Merchant and delivery addresses | Delivery wins with supporting evidence; ties require review | Basic ranking test exists |
| Similar competing addresses | Penalize close scores; never silently select unresolved winner | Confidence penalty tested; UI selection missing |
| Separate-column ZIP/city | Do not attach to unrelated street | Spatial regression needed |
| Reordered OCR blocks / scaled image | Same candidates for equivalent geometry | Regression needed |
| Missing/zero geometry | Conservative text fallback with uncertainty | Regression needed |
| No text / phone and menu only | Visible failure; correction/rescan available | Parser negatives exist; manual recovery missing |
| Invalid date, midnight/noon, alternate time formats | Reject impossible values; parse supported patterns accurately | Invalid date and basic 12-hour tests exist; broaden with evidence |
| Reprint and order timestamps together | Rank order timestamp or require selection | Regression needed |
| Unknown/weak template match | Generic parser runs; template cannot force acceptance | Template implementation pending |
| Strong time, weak address | Time cannot mask uncertain destination | Safety regression needed |
| Cancel/correct/save/retry | No premature duplicate acceptance | Current App fingerprints at recognition handoff |
| Test mode and image import | Existing switches and emulator import remain usable | Manual regression required |

## Dependencies and completion gates

Steps 2–3 implement extraction; Step 4 implements the confidence contract;
Step 5 implements recovery and save enforcement; Step 6 validates image OCR.
The current confidence labels (0.8 high / 0.5 medium), overall-score rounding,
0.7 usability gate, and draft requirement for complete candidates need review.
No changes to these mechanisms belong to Step 1.

Before image accuracy claims, capture ML Kit blocks/coordinates from emulator
imports and compare against CSV ground truth. Record candidate fields, selected
destination/time, score, warning/action, and driver resolution for each image.
Synthetic images do not establish reliability on real receipts; anonymized
real photographs and evidence for each additional POS family remain needed.

Phase completion requires zero silently accepted known wrong destinations in
the validation set, explicit recovery for missing/uncertain data, passing unit
tests, and passing emulator workflow checks. Report coverage limitations.
An optional cloud/LLM fallback can be evaluated only after deterministic gaps
are measured; it is outside this baseline. No commits without explicit request.
