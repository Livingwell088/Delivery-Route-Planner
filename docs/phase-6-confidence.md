# Phase 6, Step 4: Confidence policy

The confidence service assesses the selected candidates rather than trusting
stored overall scores. The weaker required field limits confidence. Missing or
invalid selected address/time data blocks handoff even with a high stored score.
Both individual candidate scores must be finite and in [0, 1].

Close competitors (score gap below 0.10, including a competitor ranked above
the selection) subtract 0.08 per ambiguous field and cap the overall score at
0.89. Existing parsers already deduplicate normalized destinations/timestamps
and sort candidates. Template rules retain those alternatives and source IDs.

Unrounded scores determine behavior: >=0.90 accepts extraction while displaying
it, >=0.70 and <0.90 requires confirmation, and <0.70 requires correction/rescan.
Domain confidence labels use those same boundaries. The UI displays overall
confidence rounded downward to one decimal percent so a medium score never
appears as 90%. It exposes evidence, labels the action and guards the handoff.
The App independently guards recognition handoff. Medium-confidence drafts
retain a confirmation warning; all orders still require Confirm and add order.
Success vibration is limited to the accept band and excludes duplicates.

Manual correction, alternative selection, warning resolution and save-time
duplicate handling remain Step 5 work. Until then low scores offer rescan.
Missing ZIP is still incomplete in the current domain model. No candidate
ranking rule establishes that an address exists or that OCR read every unit;
real image checks remain necessary.

Validation: 41 tests pass. New cases exercise 0.6999/0.70/0.89/0.8999/0.90/1.00,
domain labels, invalid scores/fields, close alternatives, actual selection,
stale stored confidence and weak address/time masking. Emulator UI validation
is pending; test mode and image import are unchanged.
