import assert from 'node:assert/strict';
import test from 'node:test';
import { createOrderDraftFromReceipt, createManualReceiptDraft, validateReceiptDraft } from '../src/services/receiptOrderDraft.js';
import { createReceiptFingerprint, createDraftReceiptFingerprint } from '../src/services/receiptDuplicate.js';

function scan(addressScore = 0.95, timeScore = 0.95) {
  return { addressCandidates: [{ id: 'address', streetAddress: '455 Main St Room 206', city: 'Worcester',
    state: 'MA', postalCode: '01608', confidence: { value: addressScore } }],
  timestampCandidates: [{ id: 'time', timestamp: '2026-08-29T20:12:00.000Z', confidence: { value: timeScore } }],
  selectedAddressCandidateId: 'address', selectedTimestampCandidateId: 'time' };
}
function draft(input = scan()) {
  return createOrderDraftFromReceipt(input, 'OCR-123', { allowCorrection: true });
}

test('high and medium receipt drafts are ready for the single confirm action', () => {
  for (const score of [0.95, 0.8]) {
    const input = draft(scan(score, score));

    assert.equal(validateReceiptDraft(input), null);
  }
});

test('low confidence address cannot pass unchanged through the single confirm action', () => {
  const input = draft(scan(0.6));
  assert.match(validateReceiptDraft(input), /Correct.*address/);
  input.address.formatted_address = '455 MAIN ST ROOM 206, WORCESTER, MA 01608';
  assert.match(validateReceiptDraft(input), /Correct.*address/);
  input.address.formatted_address = '455 Main St Room 208, Worcester, MA 01608';
  assert.equal(validateReceiptDraft(input), null);
  assert.equal(input.receiptReview.confidence.value, 0.6);
});

test('uncertain time requires a meaningful time correction', () => {
  const input = draft(scan(0.95, 0.6));
  assert.match(validateReceiptDraft(input), /Correct.*time/);
  input.placedAt = '2026-08-29T16:12:00-04:00';
  assert.match(validateReceiptDraft(input), /Correct.*time/);
  input.placedAt = '2026-08-29T20:18:00.000Z';
  assert.equal(validateReceiptDraft(input), null);
});

test('completed manual entry without ZIP is ready for the single confirm action', () => {
  const input = createManualReceiptDraft('manual');
  assert.equal(input.address.formatted_address, '');
  assert.match(validateReceiptDraft(input), /Enter/);
  input.address.formatted_address = '455 Main St Room 206, Worcester, MA';
  input.placedAt = '2026-08-29T20:12:00.000Z';

  assert.equal(validateReceiptDraft(input), null);
});

test('missing timestamp recovery preserves the selected address and requires time entry', () => {
  const input = scan();
  input.timestampCandidates = [];
  input.selectedTimestampCandidateId = null;
  const recovery = draft(input);
  assert.match(recovery.address.formatted_address, /Room 206/);
  assert.equal(recovery.placedAt, '');
  recovery.placedAt = '2026-08-29T20:12:00.000Z';
  assert.equal(validateReceiptDraft(recovery), null);
});

test('malformed destination, invalid time and missing review metadata block save', () => {
  const input = draft();
  input.address.formatted_address = 'unknown';
  assert.match(validateReceiptDraft(input), /full destination/);
  input.address.formatted_address = '455 Main St, Worcester, MA 01608';
  input.placedAt = '';
  assert.match(validateReceiptDraft(input), /valid placed time/);
  const missingReview = draft();
  delete missingReview.receiptReview;
  assert.match(validateReceiptDraft(missingReview), /review is missing/);
});

test('final corrected draft fingerprint matches scanner identity and preserves later orders', () => {
  const input = scan();
  const result = draft(input);
  assert.equal(createDraftReceiptFingerprint(result), createReceiptFingerprint(input));
  const original = createDraftReceiptFingerprint(result);
  result.address.formatted_address = '799 Main St, Worcester, MA 01610';
  assert.notEqual(createDraftReceiptFingerprint(result), original);
  const corrected = createDraftReceiptFingerprint(result);
  result.placedAt = '2026-08-29T20:18:00.000Z';
  assert.notEqual(createDraftReceiptFingerprint(result), corrected);
});

test('manual receipt time rejects silent calendar rollover and ambiguous date strings', () => {
  for (const value of ['2026-02-30T16:12:00Z', '2026-08-29T24:00:00Z', '1', '08/29/2026', '2026-08-29T16:12:00']) {
    const input = draft();
    input.placedAt = value;
    assert.match(validateReceiptDraft(input), /valid ISO placed time/);
  }
  const valid = draft();
  valid.placedAt = '2028-02-29T16:12:00-04:00';
  assert.equal(validateReceiptDraft(valid), null);
  valid.placedAt = '2028-02-29T16:12-04:00';
  assert.equal(validateReceiptDraft(valid), null);
});
