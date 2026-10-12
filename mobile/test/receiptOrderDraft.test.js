import assert from 'node:assert/strict';
import test from 'node:test';

import { createOrderDraftFromReceipt } from '../src/services/receiptOrderDraft.js';

test('prefills an order draft from the selected OCR candidates', () => {
  const draft = createOrderDraftFromReceipt({
    addressCandidates: [{
      id: 'address-1',
      streetAddress: '59/5 Benefit St 2FL',
      city: 'Worcester',
      state: 'MA',
      postalCode: '01610',
    }],
    timestampCandidates: [{ id: 'timestamp-1', timestamp: '2026-10-02T15:06:00.000Z' }],
    selectedAddressCandidateId: 'address-1',
    selectedTimestampCandidateId: 'timestamp-1',
  }, 'OCR-123456');

  assert.deepEqual(draft, {
    order_id: 'OCR-123456',
    address: {
      formatted_address: '59/5 Benefit St 2FL, Worcester, MA 01610',
      coordinates: null,
    },
    placedAt: '2026-10-02T15:06:00.000Z',
    source: 'receipt-ocr',
  });
});

test('rejects an incomplete OCR result', () => {
  assert.throws(() => createOrderDraftFromReceipt({
    addressCandidates: [],
    timestampCandidates: [],
    selectedAddressCandidateId: null,
    selectedTimestampCandidateId: null,
  }, 'OCR-123456'), /selected address and timestamp/i);
});
