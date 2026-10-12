import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateReceiptConfidence, isReceiptScanUsable, assessReceiptScan, receiptConfidenceAction } from '../src/services/receiptConfidence.js';
import { createConfidence } from '../src/domain/receiptScan.js';

function candidate(id, value) {
  return { id, confidence: { value }, streetAddress: '455 Main St', city: 'Worcester', state: 'MA',
    postalCode: '01608', timestamp: '2026-08-29T16:12:00.000Z' };
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

  assert.equal(confidence.value, 0);
  assert.equal(isReceiptScanUsable(result), false);
});

test('penalizes similarly ranked alternatives', () => {
  const confidence = calculateReceiptConfidence({
    addressCandidates: [candidate('address-1', 0.9), candidate('address-2', 0.85)],
    timestampCandidates: [candidate('timestamp-1', 0.9)],
  });

  assert.ok(Math.abs(confidence.value - 0.82) < 1e-12);
  assert.ok(confidence.evidence.includes('address matches are similarly ranked'));
});

test('marks a complete sufficiently confident scan as usable', () => {
  assert.equal(isReceiptScanUsable({
    selectedAddressCandidateId: 'address-1',
    selectedTimestampCandidateId: 'timestamp-1',
    confidence: { value: 0.81 },
    addressCandidates: [candidate('address-1', 0.81)],
    timestampCandidates: [candidate('timestamp-1', 0.81)],
  }), true);
});

function scan(addressScore, timeScore = addressScore) {
  return { addressCandidates: [candidate('address', addressScore)],
    timestampCandidates: [candidate('time', timeScore)], selectedAddressCandidateId: 'address',
    selectedTimestampCandidateId: 'time', confidence: { value: 1 } };
}

test('confidence boundaries use unrounded scores and consistent domain labels', () => {
  for (const [value, action, level] of [[0.6999, 'correct', 'low'], [0.7, 'confirm', 'medium'],
    [0.89, 'confirm', 'medium'], [0.8999, 'confirm', 'medium'], [0.9, 'accept', 'high'], [1, 'accept', 'high']]) {
    assert.equal(receiptConfidenceAction(value), action);
    assert.equal(assessReceiptScan(scan(value)).action, action);
    assert.equal(createConfidence(value).level, level);
  }
  for (const value of [NaN, Infinity, undefined, -1, 1.1]) assert.equal(receiptConfidenceAction(value), 'correct');
});

test('strong timestamp cannot mask weak address and strong address cannot mask weak time', () => {
  for (const input of [scan(0.69, 1), scan(1, 0.69)]) {
    assert.equal(assessReceiptScan(input).action, 'correct');
    assert.equal(isReceiptScanUsable(input), false);
  }
});

test('tied high confidence destinations always require confirmation', () => {
  const input = scan(1);
  input.addressCandidates.push({ ...candidate('other', 1), streetAddress: '799 Main St' });
  const assessment = assessReceiptScan(input);
  assert.equal(assessment.action, 'confirm');
  assert.equal(assessment.confidence.value, 0.89);
});

test('assessment follows actual selected candidate rather than best match or stale overall score', () => {
  const input = scan(1);
  input.addressCandidates.push(candidate('weak', 0.6));
  input.selectedAddressCandidateId = 'weak';
  assert.equal(assessReceiptScan(input).action, 'correct');
  input.selectedAddressCandidateId = 'missing';
  assert.equal(assessReceiptScan(input).action, 'correct');
});

test('malformed required fields and scores cannot pass the handoff guard', () => {
  for (const field of ['streetAddress', 'city', 'state', 'postalCode']) {
    const input = scan(1);
    input.addressCandidates[0][field] = '';
    assert.equal(isReceiptScanUsable(input), false);
  }
  for (const value of [NaN, Infinity, -1, 1.1]) assert.equal(isReceiptScanUsable(scan(value)), false);
  const invalid = scan(1);
  invalid.timestampCandidates[0].timestamp = 'invalid';
  assert.equal(isReceiptScanUsable(invalid), false);
  assert.equal(isReceiptScanUsable(null), false);
});

test('a score gap of exactly 0.1 is not penalized as a close competitor', () => {
  const confidence = calculateReceiptConfidence({ addressCandidates: [candidate('best', 0.9), candidate('other', 0.8)],
    timestampCandidates: [candidate('time', 0.9)] });
  assert.equal(confidence.value, 0.9);
});
