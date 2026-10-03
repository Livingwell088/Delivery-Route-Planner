import assert from 'node:assert/strict';
import test from 'node:test';

import { createOCRTextBlock } from '../src/domain/receiptScan.js';
import { extractTimestampCandidates } from '../src/services/receiptTimestampParser.js';

function block(id, text, y) {
  return createOCRTextBlock({
    id,
    text,
    boundingBox: { x: 50, y, width: 850, height: 50 },
    lines: [{ id: `${id}-line`, text, boundingBox: { x: 50, y, width: 850, height: 50 } }],
  });
}

test('extracts the Ming House compact order timestamp', () => {
  const [candidate] = extractTimestampCandidates([
    block('delivery', 'Delivery', 500),
    block('timestamp', '10/2/2026 1125 AM', 600),
  ]);

  assert.equal(candidate.rawDate, '10/2/2026');
  assert.equal(candidate.rawTime, '1125 AM');
  assert.equal(candidate.timestamp, new Date(2026, 9, 2, 11, 25).toISOString());
  assert.deepEqual(candidate.sourceLineIds, ['timestamp-line']);
});

test('combines date and time from adjacent labeled lines', () => {
  const [candidate] = extractTimestampCandidates([
    block('date', 'Order Date: 10-02-26', 500),
    block('time', 'Order Time: 7:05 PM', 550),
  ]);

  assert.equal(candidate.timestamp, new Date(2026, 9, 2, 19, 5).toISOString());
  assert.deepEqual(candidate.sourceLineIds, ['date-line', 'time-line']);
  assert.ok(candidate.confidence.evidence.includes('order-related label appears nearby'));
});

test('accepts a colon recognized as whitespace by OCR', () => {
  const [candidate] = extractTimestampCandidates([
    block('timestamp', '10/2/2026 11 06 AM', 600),
  ]);

  assert.equal(candidate.rawTime, '11 06 AM');
  assert.equal(candidate.timestamp, new Date(2026, 9, 2, 11, 6).toISOString());
});

test('rejects impossible calendar dates', () => {
  const candidates = extractTimestampCandidates([
    block('timestamp', 'Order Date 2/30/2026 11:25 AM', 500),
  ]);

  assert.deepEqual(candidates, []);
});

test('does not mistake phone numbers or prices for a time', () => {
  const candidates = extractTimestampCandidates([
    block('date', '10/2/2026', 500),
    block('phone', 'Tel: 774-823-7288', 550),
    block('price', 'Total: 21.83', 600),
  ]);

  assert.deepEqual(candidates, []);
});
