# Phase 6, Step 3: Deterministic receipt templates

`receiptParser.js` is the provider-independent entry point used by the ML Kit
adapter. It runs generic address and timestamp extraction for every receipt,
then applies template evidence to those candidates without discarding them.

The initial registry contains `ming-house-delivery-v1`, based on visual
inspection of fixtures 001, 016 and 019. Standard, alternate and boxed versions
share a merchant heading, Delivery heading, timestamp, Server label and delivery
address section. Box outlines are not OCR text and do not warrant separate rules.

Recognition requires all three textual anchors in order, bounded intervening
line counts and available line geometry. Missing anchors, missing geometry and
unknown merchants use generic parsing unchanged. No template supplies address
fields, ZIP codes, dates or times.

The address region is at most three aligned lines below Server, within six line
heights. The timestamp region lies between Delivery and Server. Merchant header
addresses lose 0.25 confidence; timestamps outside the expected region lose
0.12. Supported candidates retain their score and gain an evidence explanation;
template recognition does not raise confidence. Candidates retain original IDs
and source lines. Conflicts remain available for the Step 4 ambiguity policy.

Generic timestamp parsing now penalizes explicit payment/printed/reprint labels
by 0.30 and stops searching when another date appears. These are heuristic
penalties requiring later calibration. A bare Reprint heading does not imply
the following unlabeled timestamp is a reprint time: the fixture family prints
its order time beneath that heading.

Existing supported 12-hour formats cover the inspected fixtures; no speculative
24-hour or locale-specific rules were added. Other formats remain unsupported
until examples establish their semantics.

Validation: 35 tests pass, including known layout, generic fallback, missing ZIP,
unit preservation, payment/reprint alternatives and conflicting date pairing.
Template test blocks are synthetic text/coordinates derived from visual
inspection, not captured ML Kit output. Emulator validation and real receipt
coverage remain pending. Confidence policy and manual recovery belong to Steps
4–5. Test mode and image import were not changed.
