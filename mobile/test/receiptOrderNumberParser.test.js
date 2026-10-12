import assert from 'node:assert/strict';
import test from 'node:test';
import { extractOrderNumberCandidates, selectOrderNumberCandidate } from '../src/services/receiptOrderNumberParser.js';
import { createOrderDraftFromReceipt, validateReceiptDraft } from '../src/services/receiptOrderDraft.js';

const block = (text, index, box = { x: 50, y: index * 60, width: 500, height: 40 }) =>
  ({ id: `b${index}`, text, lines: [{ id: `l${index}`, text, boundingBox: box }] });
const extract = (texts) => extractOrderNumberCandidates(texts.map((text, i) => block(text, i)), { width: 1000, height: 2000 });

test('captures labeled order numbers and preserves leading zeros', () => {
  for (const label of ['Order #00123', 'ORDER NO. 00123', 'Order Number: 00123', 'Order 00123']) {
    assert.equal(extract([label])[0].orderNumber, '00123');
  }
});

test('ignores prices, dates, phone numbers and unlabeled numbers', () => {
  assert.deepEqual(extract(['Order 12.50', 'Order 08/29/2026', 'Order 508-555-1234', '01609', 'Reprint 1', '2', '120']), []);
});

test('captures the prominent Ming House number beside the date independent of OCR order', () => {
  const blocks = [block('Ming House', 0), block('08/29/2026 4:12 PM', 1, { x: 50, y: 350, width: 500, height: 50 }),
    block('101', 2, { x: 800, y: 330, width: 150, height: 100 }), block('01609', 3)];
  const candidates = extractOrderNumberCandidates(blocks.reverse(), { width: 1000, height: 2000 });
  assert.deepEqual(candidates.map(({ orderNumber }) => orderNumber), ['101']);
  assert.equal(selectOrderNumberCandidate(candidates), candidates[0].id);
});

test('deduplicates repeated numbers and leaves conflicting labels unselected', () => {
  assert.equal(extract(['Order #123', 'Order Number: 123']).length, 1);
  assert.equal(selectOrderNumberCandidate(extract(['Order #123', 'Order #124'])), null);
});

test('single-digit numbers use receipt-relative geometry in distant and close-up photos', () => {
  for (const orderNumber of ['1', '2', '3']) {
    const blocks = [block('Ming House', 0, { x: 400, y: 850, width: 500, height: 80 }),
      block('10/2/2026 11:06 AM', 1, { x: 100, y: 1320, width: 600, height: 55 }),
      block(orderNumber, 2, { x: 1080, y: 1310, width: 60, height: 80 }),
      block('1', 3, { x: 900, y: 1180, width: 40, height: 55 }),
      block('2', 4, { x: 200, y: 1750, width: 40, height: 80 })];
    assert.deepEqual(extractOrderNumberCandidates(blocks, { width: 1368, height: 1824 })
      .map((candidate) => candidate.orderNumber), [orderNumber]);
  }
});

test('real-photo OCR bounds do not require a tall digit compared with the date row', () => {
  const blocks = [block('Ming House', 0, { x: 950, y: 482, width: 685, height: 109 }),
    block('10/2/2026 11.05 AM', 1, { x: 482, y: 1057, width: 787, height: 84 }),
    block('1', 2, { x: 1800, y: 1059, width: 39, height: 100 })];
  assert.equal(extractOrderNumberCandidates(blocks, { width: 3024, height: 4032 })[0].orderNumber, '1');
});

test('draft uses the printed number and requires entry when it is missing', () => {
  const scan = { addressCandidates: [], timestampCandidates: [], orderNumberCandidates: extract(['Order #00123']),
    selectedAddressCandidateId: null, selectedTimestampCandidateId: null };
  scan.selectedOrderNumberCandidateId = scan.orderNumberCandidates[0].id;
  assert.equal(createOrderDraftFromReceipt(scan, undefined, { allowCorrection: true }).order_id, '00123');
  scan.selectedOrderNumberCandidateId = null;
  const draft = createOrderDraftFromReceipt(scan, undefined, { allowCorrection: true });
  assert.equal(draft.order_id, '');
  assert.equal(validateReceiptDraft(draft), 'Enter the order number printed on the receipt.');
});
