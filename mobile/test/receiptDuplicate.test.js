import assert from 'node:assert/strict';
import test from 'node:test';

import { createReceiptFingerprint, isDuplicateReceipt } from '../src/services/receiptDuplicate.js';

function result({
  streetAddress = '59/5 Benefit St 2FL',
  city = 'Worcester',
  state = 'MA',
  postalCode = '01610',
  timestamp = '2026-10-02T15:06:00.000Z',
} = {}) {
  return {
    addressCandidates: [{ id: 'address-1', streetAddress, city, state, postalCode }],
    timestampCandidates: [{ id: 'timestamp-1', timestamp }],
    selectedAddressCandidateId: 'address-1',
    selectedTimestampCandidateId: 'timestamp-1',
  };
}

test('normalizes formatting differences into the same receipt fingerprint', () => {
  const original = createReceiptFingerprint(result());
  const reformatted = createReceiptFingerprint(result({
    streetAddress: '59/5 BENEFIT ST. #2FL',
    city: 'WORCESTER',
    state: 'ma',
  }));

  assert.equal(original, reformatted);
});

test('detects a previously accepted receipt', () => {
  const scan = result();
  assert.equal(isDuplicateReceipt(scan, [createReceiptFingerprint(scan)]), true);
});

test('allows a later order delivered to the same address', () => {
  const earlier = result();
  const later = result({ timestamp: '2026-10-02T15:16:00.000Z' });

  assert.equal(isDuplicateReceipt(later, [createReceiptFingerprint(earlier)]), false);
});

test('cannot fingerprint an incomplete scan', () => {
  assert.equal(createReceiptFingerprint({
    addressCandidates: [],
    timestampCandidates: [],
    selectedAddressCandidateId: null,
    selectedTimestampCandidateId: null,
  }), null);
});
