import assert from 'node:assert/strict';
import test from 'node:test';
import { editPlacedTime, formatPlacedTime } from '../src/services/placedTime.js';

test('display contains only Eastern clock time and accounts for summer/winter', () => {
  assert.equal(formatPlacedTime('2026-10-02T15:06:00.000Z'), '11:06 AM');
  assert.equal(formatPlacedTime('2026-01-02T15:06:00.000Z'), '10:06 AM');
  assert.equal(formatPlacedTime(''), '');
});
test('edits preserve the original Eastern date and convert back to ISO', () => {
  assert.equal(editPlacedTime('3:15 PM', '2026-10-02T15:06:00Z'), '2026-10-02T19:15:00.000Z');
  assert.equal(editPlacedTime('15:15', '2026-01-02T15:06:00Z'), '2026-01-02T20:15:00.000Z');
});
test('midnight boundaries use Eastern date rather than UTC date', () => {
  assert.equal(editPlacedTime('12:05 AM', '2026-10-03T02:00:00Z'), '2026-10-02T04:05:00.000Z');
  assert.equal(editPlacedTime('12:05 PM', '2026-10-03T02:00:00Z'), '2026-10-02T16:05:00.000Z');
});
test('missing receipt time uses the current Eastern day', () => {
  assert.equal(editPlacedTime('9:00 PM', '', new Date('2026-10-17T02:00:00Z')), '2026-10-17T01:00:00.000Z');
});
test('invalid times and the daylight-saving gap cannot silently normalize', () => {
  for (const value of ['25:00', '0:20 PM', '13:20 AM', '3:75 PM', '', '3 PM']) {
    assert.equal(editPlacedTime(value, '2026-10-02T15:06:00Z'), null);
  }
  assert.equal(editPlacedTime('2:30 AM', '2026-03-08T12:00:00Z'), null);
});
test('fall-back repeated hour retains the original offset', () => {
  assert.equal(editPlacedTime('1:15 AM', '2026-11-01T05:30:00Z'), '2026-11-01T05:15:00.000Z');
  assert.equal(editPlacedTime('1:15 AM', '2026-11-01T06:30:00Z'), '2026-11-01T06:15:00.000Z');
});
test('re-entering the displayed time preserves seconds and order identity', () => {
  assert.equal(editPlacedTime('11:06 AM', '2026-10-02T15:06:43Z'), '2026-10-02T15:06:43.000Z');
});
