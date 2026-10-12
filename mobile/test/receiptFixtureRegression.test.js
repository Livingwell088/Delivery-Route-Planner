import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseReceiptCandidates } from '../src/services/receiptParser.js';
import { assessReceiptScan } from '../src/services/receiptConfidence.js';

// Ground truth contains quoted commas but no multiline fields.
function csvFields(line) {
  const fields = [];
  let current = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { fields.push(current); current = ''; }
    else current += char;
  }
  return [...fields, current];
}
const csv = readFileSync(new URL('../../data/fixtures/receipts/ground-truth.csv', import.meta.url), 'utf8').trim().split(/\r?\n/);
const headers = csvFields(csv.shift());
const fixtures = csv.map((line) => Object.fromEntries(csvFields(line).map((value, index) => [headers[index], value])));
const normalize = (text) => text.toUpperCase().replace(/[^A-Z0-9]/g, '');

for (const fixture of fixtures) {
  test(`ideal-text ground-truth regression: ${fixture.file}`, () => {
    const [year, month, day] = fixture.order_date.split('-');
    const texts = ['Ming House', '217A Chandler St Worcester, MA 01609', 'Tel: 000-000-0000',
      'Delivery 外送', 'Reprint 1', `${month}/${day}/${year} ${fixture.order_time}`, 'Server: TEST',
      fixture.address_line_1, fixture.address_line_2, fixture.address_line_3].filter(Boolean);
    const blocks = texts.map((text, index) => ({ id: `b${index}`, text,
      boundingBox: { x: 50, y: 50 + index * 60, width: 850, height: 50 },
      lines: [{ id: `l${index}`, text, boundingBox: { x: 50, y: 50 + index * 60, width: 850, height: 50 } }] }));
    blocks[5].boundingBox.width = 500;
    blocks[5].lines[0].boundingBox.width = 500;
    blocks.push({ id: 'order', text: fixture.order_number, lines: [{ id: 'order-line', text: fixture.order_number,
      boundingBox: { x: 800, y: 330, width: 150, height: 100 } }] });
    const result = parseReceiptCandidates(blocks, { width: 1000, height: 2000 });
    assert.equal(result.orderNumberCandidates.find(({ id }) => id === result.selectedOrderNumberCandidateId)?.orderNumber, fixture.order_number);
    result.selectedAddressCandidateId = result.addressCandidates[0]?.id ?? null;
    result.selectedTimestampCandidateId = result.timestampCandidates[0]?.id ?? null;
    assert.equal(result.templateId, 'ming-house-delivery-v1');
    const time = result.timestampCandidates[0];
    const [clock, meridiem] = fixture.order_time.split(' ');
    const [hour, minute] = clock.split(':').map(Number);
    assert.equal(time.timestamp, new Date(Number(year), Number(month) - 1, Number(day),
      hour % 12 + (meridiem === 'PM' ? 12 : 0), minute).toISOString());
    if (fixture.categories.includes('missing-zip')) {
      assert.equal(assessReceiptScan(result).action, 'correct');
      assert.ok(result.addressCandidates.every((candidate) => normalize(candidate.streetAddress) !== normalize(fixture.address_line_1)));
    } else {
      const address = result.addressCandidates[0];
      const hasUnit = /^(?:SUITE|ROOM)\b/.test(fixture.address_line_2);
      assert.equal(normalize(address.streetAddress), normalize(`${fixture.address_line_1}${hasUnit ? ` ${fixture.address_line_2}` : ''}`));
      assert.equal(address.city, 'Worcester');
      assert.equal(address.state, 'MA');
      assert.equal(address.postalCode, (hasUnit ? fixture.address_line_3 : fixture.address_line_2).match(/\d{5}$/)[0]);
      assert.equal(assessReceiptScan(result).action, 'confirm');
    }
  });
}
