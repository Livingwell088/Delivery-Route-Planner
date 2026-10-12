import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateReceiptConfidence, isReceiptScanUsable } from '../src/services/receiptConfidence.js';

function candidate(id, value) {
  return { id, confidence: { value } };
}

test('produces a high confidence score when both required fields are strong', () => {
  const confidence = calculateReceiptConfidence({
    addressCandidates: [candidate('address-1', 0.92), candidate('restaurant', 0.65)],
    timestampCandidates: [candidate('timestamp-1', 0.92)],
  });

  assert.equal(confidence.value, 0.92);
  assert.equal(confidence.level, 'high');
  assert.ok(confidence.evidence.includes('complete delivery address detected'));
  assert.ok(confidence.evidence.includes('complete order timestamp detected'));
});

test('missing a required field keeps the scan below the usable threshold', () => {
  const confidence = calculateReceiptConfidence({
    addressCandidates: [candidate('address-1', 0.92)],
    timestampCandidates: [],
  });
  const result = {
    selectedAddressCandidateId: 'address-1',
    selectedTimestampCandidateId: null,
    confidence,
  };

  assert.equal(confidence.value, 0.6);
  assert.equal(isReceiptScanUsable(result), false);
});

test('penalizes similarly ranked alternatives', () => {
  const confidence = calculateReceiptConfidence({
    addressCandidates: [candidate('address-1', 0.9), candidate('address-2', 0.85)],
    timestampCandidates: [candidate('timestamp-1', 0.9)],
  });

  assert.equal(confidence.value, 0.82);
  assert.ok(confidence.evidence.includes('address matches are similarly ranked'));
});

test('marks a complete sufficiently confident scan as usable', () => {
  assert.equal(isReceiptScanUsable({
    selectedAddressCandidateId: 'address-1',
    selectedTimestampCandidateId: 'timestamp-1',
    confidence: { value: 0.81 },
  }), true);
});
