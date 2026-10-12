import assert from 'node:assert/strict';
import test from 'node:test';

import { createOCRTextBlock } from '../src/domain/receiptScan.js';
import { extractAddressCandidates } from '../src/services/receiptAddressParser.js';

const imageSize = { width: 1000, height: 2000 };

function block(id, text, y) {
  return createOCRTextBlock({
    id,
    text,
    boundingBox: { x: 50, y, width: 850, height: 50 },
    lines: [{ id: `${id}-line`, text, boundingBox: { x: 50, y, width: 850, height: 50 } }],
  });
}

test('ranks a labeled delivery address above a restaurant header address', () => {
  const candidates = extractAddressCandidates([
    block('restaurant', '217 A Chandler St Worcester, MA 01609', 100),
    block('restaurant-phone', 'Tel: (508) 756-6888', 160),
    block('delivery-label', 'Delivery', 600),
    block('order-time', '10/2/2026 1125 AM', 700),
    block('delivery-street', '1 ROCKPORT RD #2', 850),
    block('delivery-region', 'WORCESTER, 01605', 910),
  ], imageSize);

  assert.equal(candidates.length, 2);
  assert.deepEqual(
    {
      streetAddress: candidates[0].streetAddress,
      city: candidates[0].city,
      state: candidates[0].state,
      postalCode: candidates[0].postalCode,
    },
    { streetAddress: '1 Rockport Rd #2', city: 'Worcester', state: 'MA', postalCode: '01605' },
  );
  assert.ok(candidates[0].confidence.value > candidates[1].confidence.value);
});

test('extracts a complete address printed on one line', () => {
  const [candidate] = extractAddressCandidates([
    block('address', '42 Main Street Boston, MA 02108', 700),
  ], imageSize);

  assert.equal(candidate.streetAddress, '42 Main St');
  assert.equal(candidate.city, 'Boston');
  assert.equal(candidate.state, 'MA');
  assert.equal(candidate.postalCode, '02108');
  assert.deepEqual(candidate.sourceLineIds, ['address-line']);
});

test('extracts the Benefit Street receipt address with a split house number and floor', () => {
  const [candidate] = extractAddressCandidates([
    block('delivery-label', 'Delivery', 600),
    block('street', '59/5 BENEFIT ST 2FL', 850),
    block('region', 'WORCESTER, 01610', 910),
  ], imageSize);

  assert.deepEqual(
    {
      streetAddress: candidate.streetAddress,
      city: candidate.city,
      state: candidate.state,
      postalCode: candidate.postalCode,
    },
    { streetAddress: '59/5 Benefit St 2FL', city: 'Worcester', state: 'MA', postalCode: '01610' },
  );
});

test('does not invent a state when the ZIP code is outside supported Massachusetts context', () => {
  const candidates = extractAddressCandidates([
    block('street', '12 Broadway Ave', 700),
    block('region', 'Albany, 12207', 760),
  ], imageSize);

  assert.deepEqual(candidates, []);
});

test('ignores menu lines and phone numbers', () => {
  const candidates = extractAddressCandidates([
    block('item', '2 Pork Fried Rice', 700),
    block('phone', 'Tel: 774-823-7288', 760),
  ], imageSize);

  assert.deepEqual(candidates, []);
});

test('preserves separate suite and room lines with their source evidence', () => {
  for (const unit of ['SUITE 200', 'ROOM 206']) {
    const [candidate] = extractAddressCandidates([
      block('street', '455 MAIN ST', 700),
      block('unit', unit, 760),
      block('region', 'WORCESTER, MA 01608', 820),
    ], imageSize);
    assert.equal(candidate.streetAddress, `455 Main St ${unit === 'SUITE 200' ? 'Suite 200' : 'Room 206'}`);
    assert.deepEqual(candidate.sourceLineIds, ['street-line', 'unit-line', 'region-line']);
  }
});

test('supports Square and ZIP+4 without losing leading ZIP zeros', () => {
  const [candidate] = extractAddressCandidates([
    block('street', '2 WASHINGTON SQUARE', 700),
    block('region', 'WORCESTER, MA 01604-1234', 760),
  ], imageSize);
  assert.equal(candidate.streetAddress, '2 Washington Square');
  assert.equal(candidate.postalCode, '01604-1234');
});

test('does not combine a street with a distant or separate-column region', () => {
  for (const [x, y] of [[500, 760], [50, 1200]]) {
    const original = block('region', 'WORCESTER, MA 01608', y);
    const region = { ...original, lines: [{ ...original.lines[0], boundingBox: { x, y, width: 400, height: 50 } }] };
    assert.deepEqual(extractAddressCandidates([block('street', '455 MAIN ST', 700), region], imageSize), []);
  }
});

test('shuffling and uniformly scaling OCR geometry preserves the address', () => {
  const input = [block('street', '311 MAIN ST', 700), block('unit', 'SUITE 200', 760),
    block('region', 'WORCESTER, MA 01608', 820)];
  const expected = extractAddressCandidates(input, imageSize);
  const scaled = input.slice().reverse().map((item) => ({ ...item,
    lines: item.lines.map((line) => ({ ...line, boundingBox: Object.fromEntries(
      Object.entries(line.boundingBox).map(([key, value]) => [key, value * 2])) })) }));
  assert.deepEqual(extractAddressCandidates(scaled, { width: 2000, height: 4000 }), expected);
});

test('missing ZIP never borrows a later address ZIP', () => {
  const candidates = extractAddressCandidates([
    block('missing-street', '455 MAIN ST', 700), block('missing-region', 'WORCESTER, MA', 760),
    block('other-street', '799 MAIN ST', 820), block('other-region', 'WORCESTER, MA 01610', 880),
  ], imageSize);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].streetAddress, '799 Main St');
});

test('block-only text uses conservative geometry-free fallback within its own block', () => {
  const input = [{ id: 'fallback', text: 'Delivery\n455 MAIN ST\nROOM 206\nWORCESTER, MA 01608',
    boundingBox: { x: 50, y: 700, width: 850, height: 200 }, lines: [] }];
  const [candidate] = extractAddressCandidates(input, imageSize);
  assert.equal(candidate.streetAddress, '455 Main St Room 206');
  assert.ok(candidate.confidence.value < 0.9);
  assert.ok(candidate.confidence.evidence.includes('OCR line geometry unavailable'));
  assert.deepEqual(extractAddressCandidates([
    { ...input[0], text: '455 MAIN ST' },
    { ...input[0], id: 'unrelated', text: 'WORCESTER, MA 01608' },
  ], imageSize), []);
});
