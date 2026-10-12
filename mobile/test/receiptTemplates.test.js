import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReceiptCandidates } from '../src/services/receiptParser.js';
import { extractAddressCandidates } from '../src/services/receiptAddressParser.js';
import { extractTimestampCandidates } from '../src/services/receiptTimestampParser.js';

const imageSize = { width: 1000, height: 2000 };
function blocks(texts) {
  return texts.map((text, index) => ({ id: `b${index}`, text,
    boundingBox: { x: 50, y: 50 + index * 60, width: 850, height: 50 },
    lines: [{ id: `l${index}`, text,
      boundingBox: { x: 50, y: 50 + index * 60, width: 850, height: 50 } }] }));
}
const layout = ['Ming House', '217A Chandler St Worcester, MA 01609', 'Tel: 000-000-0000',
  'Delivery 外送', 'Reprint 1', '8/29/2026 04:12 PM', 'Server: TEST',
  '455 MAIN ST', 'ROOM 206', 'WORCESTER, MA 01608', 'Tel: 000-000-0000'];

test('known template preserves delivery units and penalizes merchant address without losing candidates', () => {
  const result = parseReceiptCandidates(blocks(layout), imageSize);
  assert.equal(result.templateId, 'ming-house-delivery-v1');
  assert.equal(result.addressCandidates.length, 2);
  assert.equal(result.addressCandidates[0].streetAddress, '455 Main St Room 206');
  assert.ok(result.addressCandidates[0].confidence.evidence.some((text) => text.includes('expected delivery region')));
  assert.ok(result.addressCandidates[1].confidence.evidence.some((text) => text.includes('merchant header')));
  assert.ok(result.timestampCandidates[0].confidence.evidence.some((text) => text.includes('expected delivery region')));
});

test('alternate and boxed variants use the same textual template', () => {
  for (const reprint of ['Reprint 3', 'Reprint 1']) {
    const variant = [...layout];
    variant[4] = reprint;
    assert.equal(parseReceiptCandidates(blocks(variant), imageSize).templateId, 'ming-house-delivery-v1');
  }
});

test('unknown merchant and weak known-layout matches return generic candidates unchanged', () => {
  for (const texts of [[...layout.slice(1)], ['Another Restaurant', ...layout.slice(1)],
    layout.filter((text) => !text.startsWith('Server:'))]) {
    const input = blocks(texts);
    const result = parseReceiptCandidates(input, imageSize);
    assert.equal(result.templateId, null);
    assert.deepEqual(result.addressCandidates, extractAddressCandidates(input, imageSize));
    assert.deepEqual(result.timestampCandidates, extractTimestampCandidates(input));
  }
});

test('template never supplies a missing ZIP or hides extraction failure', () => {
  const texts = layout.map((text) => text === 'WORCESTER, MA 01608' ? 'WORCESTER, MA' : text);
  const result = parseReceiptCandidates(blocks(texts), imageSize);
  assert.equal(result.templateId, 'ming-house-delivery-v1');
  assert.equal(result.addressCandidates.length, 1);
  assert.equal(result.addressCandidates[0].streetAddress, '217a Chandler St');
  assert.ok(result.addressCandidates[0].confidence.value < 0.7);
});

test('payment and reprint timestamps remain alternatives below the expected order time', () => {
  const result = parseReceiptCandidates(blocks([...layout,
    'Payment: 8/29/2026 04:30 PM', 'Reprinted: 8/29/2026 04:40 PM']), imageSize);
  assert.equal(result.timestampCandidates.length, 3);
  assert.equal(result.timestampCandidates[0].rawTime, '04:12 PM');
  assert.ok(result.timestampCandidates[1].confidence.evidence.includes('payment or reprint timestamp label detected'));
});

test('known merchant with missing geometry uses generic fallback', () => {
  const input = [{ id: 'text', text: layout.join('\n'), lines: [],
    boundingBox: { x: 0, y: 0, width: 0, height: 0 } }];
  assert.equal(parseReceiptCandidates(input, imageSize).templateId, null);
});

test('date cannot borrow a time belonging to a different date', () => {
  const candidates = extractTimestampCandidates(blocks(['Order date: 8/29/2026', '8/30/2026 04:30 PM']));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].rawDate, '8/30/2026');
});

test('split payment label penalizes its timestamp', () => {
  const [candidate] = extractTimestampCandidates(blocks(['8/29/2026', 'Payment Time: 04:30 PM']));
  assert.ok(candidate.confidence.evidence.includes('payment or reprint timestamp label detected'));
});
