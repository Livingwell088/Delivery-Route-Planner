import assert from 'node:assert/strict';
import test from 'node:test';
import { beginReceiptEntry, prepareReceiptEntry, commitReceiptEntry, receiptFingerprintsForEntry,
  removeReceiptOrder, receiptEntryRoutePreference } from '../src/services/receiptEntry.js';
import { createOrderDraftFromReceipt } from '../src/services/receiptOrderDraft.js';
import { createDraftReceiptFingerprint, createReceiptFingerprint } from '../src/services/receiptDuplicate.js';
import { changeRouteInputs, createRoutePlan, changeRouteSequence } from '../src/services/routePlan.js';
import { encodeActiveSession, decodeActiveSession } from '../src/services/activeSession.js';

const now = Date.parse('2026-10-19T22:00:00Z');
function scan(id, street = `${id === 'A' ? 10 : id === 'B' ? 20 : 40} Example St Apt 2`, placedAt = '2026-10-19T21:30:00Z') {
  return { addressCandidates: [{ id: 'address', streetAddress: street, city: 'Worcester', state: 'MA', postalCode: '01608', confidence: { value: .95 } }],
    timestampCandidates: [{ id: 'time', timestamp: placedAt, confidence: { value: .95 } }],
    orderNumberCandidates: [{ id: 'number', orderNumber: id, confidence: { value: .95 } }],
    selectedAddressCandidateId: 'address', selectedTimestampCandidateId: 'time', selectedOrderNumberCandidateId: 'number' };
}
const draftFrom = (result) => createOrderDraftFromReceipt(result, undefined, { allowCorrection: true });
function confirmed(draft) {
  return { ...draft, address: { ...draft.address, raw_address: draft.address.formatted_address,
    unit: 'Apt 2', coordinates: { latitude: 42, longitude: -71 },
    validated_location: { provider: 'google', place_id: 'synthetic', validation_reference: 'signed',
      expires_at: new Date(now + 3600000).toISOString() } } };
}
function save(run, result, entry = beginReceiptEntry(run.orders)) {
  const prepared = prepareReceiptEntry(run.orders, run.fingerprints, entry, draftFrom(result), result);
  return commitReceiptEntry(run.orders, run.fingerprints, entry, confirmed(prepared.draft), prepared.receiptFingerprints);
}
function activeRun() {
  return ['A', 'B', 'C'].reduce((run, id) => save(run, scan(id)), { orders: [], fingerprints: [] });
}

test('consecutive scans add exactly one confirmed order each and retain receipt identities', () => {
  const run = activeRun();
  assert.deepEqual(run.orders.map((order) => order.order_id), ['A', 'B', 'C']);
  assert.equal(new Set(run.fingerprints).size, 3);
  assert.ok(run.orders.every((order) => order.receiptFingerprints.length === 1));
});

test('beginning and reviewing a rescan leaves the original order and fingerprints untouched', () => {
  const run = activeRun();
  const original = structuredClone(run);
  const entry = beginReceiptEntry(run.orders, 'A');
  const result = scan('A', '50 Corrected St Suite 3');
  prepareReceiptEntry(run.orders, run.fingerprints, entry, draftFrom(result), result);
  assert.deepEqual(run, original);
  assert.ok(run.fingerprints.includes(createReceiptFingerprint(scan('A'))));
});

test('rescan accepts its own original receipt without admitting another order duplicate', () => {
  const run = activeRun();
  const entry = beginReceiptEntry(run.orders, 'A');
  assert.doesNotThrow(() => prepareReceiptEntry(run.orders, run.fingerprints, entry, draftFrom(scan('A')), scan('A')));
  assert.throws(() => prepareReceiptEntry(run.orders, run.fingerprints, entry, draftFrom(scan('B')), scan('B')), /already/);
  const correctedB = { ...draftFrom(scan('B')), order_id: 'D', address: { formatted_address: '90 Different St, Worcester, MA 01608' } };
  assert.throws(() => prepareReceiptEntry(run.orders, run.fingerprints, entry, correctedB, scan('B')), /already belongs/);
});

test('replacement swaps one order atomically, replaces fingerprints, and retains its manual sequence position after ID correction', () => {
  const run = activeRun();
  const entry = beginReceiptEntry(run.orders, 'A');
  let plan = changeRouteSequence(changeRouteInputs(createRoutePlan(), run.orders, null), ['C', 'A', 'B'], run.orders);
  const result = scan('A-corrected', '50 Corrected St Suite 3', '2026-10-19T21:35:00Z');
  const next = save(run, result, entry);
  plan = changeRouteInputs(plan, next.orders, null, receiptEntryRoutePreference(plan, entry, 'A-corrected'));
  assert.equal(next.orders.length, 3);
  assert.deepEqual(next.orders.map((order) => order.order_id), ['A-corrected', 'B', 'C']);
  assert.deepEqual(plan.sequence, ['C', 'A-corrected', 'B']);
  assert.equal(plan.sequenceSource, 'manual');
  assert.equal(plan.status, 'needs_calculation');
  assert.equal(next.fingerprints.includes(createReceiptFingerprint(scan('A'))), false);
  assert.equal(next.fingerprints.includes(createReceiptFingerprint(result)), true);
  assert.equal(run.orders[0].order_id, 'A');
});

test('replacement preserves both original OCR and corrected fingerprints until removal', () => {
  const run = activeRun();
  const entry = beginReceiptEntry(run.orders, 'A');
  const result = scan('A', '50 Corrected St Suite 3');
  const draft = { ...draftFrom(result), placedAt: '2026-10-19T21:36:00Z' };
  const prepared = prepareReceiptEntry(run.orders, run.fingerprints, entry, draft, result);
  const next = commitReceiptEntry(run.orders, run.fingerprints, entry, confirmed(prepared.draft), prepared.receiptFingerprints);
  assert.equal(next.fingerprints.includes(createReceiptFingerprint(result)), true);
  assert.equal(next.fingerprints.includes(createDraftReceiptFingerprint(draft)), true);
  const removed = removeReceiptOrder(next.orders, next.fingerprints, 'A');
  assert.equal(removed.fingerprints.includes(createReceiptFingerprint(result)), false);
  assert.equal(removed.fingerprints.includes(createDraftReceiptFingerprint(draft)), false);
  assert.doesNotThrow(() => save(removed, result));
});

test('fingerprints shared by another active order and unowned legacy protections are not lost', () => {
  const run = activeRun();
  const own = run.orders[0].receiptFingerprints[0];
  run.orders[1].receiptFingerprints.push(own);
  run.fingerprints.push('legacy-protection');
  const filtered = receiptFingerprintsForEntry(run.orders, run.fingerprints, 'A');
  assert.ok(filtered.includes(own));
  assert.ok(filtered.includes('legacy-protection'));
  assert.throws(() => save(run, scan('A'), beginReceiptEntry(run.orders, 'A')), /already belongs/);
  const removed = removeReceiptOrder(run.orders, run.fingerprints, 'A');
  assert.ok(removed.fingerprints.includes(own));
  assert.ok(removed.fingerprints.includes('legacy-protection'));
});

test('eight-order limit is checked before scanning and again before commit while replacement remains available', () => {
  let run = { orders: [], fingerprints: [] };
  for (let i = 0; i < 8; i++) run = save(run, scan(`order-${i}`, `${i + 1} Example St`));
  assert.throws(() => beginReceiptEntry(run.orders), /eight orders/);
  const entry = beginReceiptEntry(run.orders, 'order-3');
  assert.equal(save(run, scan('corrected', '99 Example St'), entry).orders.length, 8);
  const earlierEntry = beginReceiptEntry(run.orders.slice(0, 7));
  const result = scan('ninth', '90 Example St');
  assert.throws(() => prepareReceiptEntry(run.orders, run.fingerprints, earlierEntry, draftFrom(result), result), /eight orders/);
  assert.throws(() => commitReceiptEntry(run.orders, run.fingerprints, earlierEntry, confirmed(draftFrom(result)), []), /eight orders/);
});

test('target removed or changed during confirmation cannot be overwritten by the old entry', () => {
  const run = activeRun();
  const entry = beginReceiptEntry(run.orders, 'A');
  const result = scan('A', '50 Corrected St');
  const prepared = prepareReceiptEntry(run.orders, run.fingerprints, entry, draftFrom(result), result);
  for (const changed of [run.orders.slice(1), run.orders.map((order, i) => i ? order : { ...order, placedAt: '2026-10-19T21:31:00Z' })]) {
    assert.throws(() => commitReceiptEntry(changed, run.fingerprints, entry, confirmed(prepared.draft), prepared.receiptFingerprints), /original order changed/);
  }
  assert.throws(() => beginReceiptEntry(run.orders, 'missing'), /no longer/);
});

test('duplicate introduced after preparation still blocks commit and repeated confirmation cannot append another copy', () => {
  const run = activeRun();
  const entry = beginReceiptEntry(run.orders);
  const result = scan('D', '90 Example St');
  const prepared = prepareReceiptEntry(run.orders, run.fingerprints, entry, draftFrom(result), result);
  const next = commitReceiptEntry(run.orders, run.fingerprints, entry, confirmed(prepared.draft), prepared.receiptFingerprints);
  assert.throws(() => commitReceiptEntry(next.orders, next.fingerprints, entry, confirmed(prepared.draft), prepared.receiptFingerprints), /already in the list/);
  assert.equal(next.orders.length, 4);
});

test('order IDs are trimmed without losing leading zeros and reserved IDs cannot be saved', () => {
  const empty = { orders: [], fingerprints: [] };
  const entry = beginReceiptEntry([]);
  const result = scan(' 00108 ');
  const next = save(empty, result, entry);
  assert.equal(next.orders[0].order_id, '00108');
  assert.throws(() => prepareReceiptEntry(next.orders, next.fingerprints, beginReceiptEntry(next.orders), draftFrom(result), result), /already/);
  assert.throws(() => prepareReceiptEntry([], [], entry, draftFrom(scan('start')), scan('start')), /reserved/);
});

test('successful replacements and removals persist with their remaining duplicate protections', () => {
  const run = activeRun();
  const replaced = save(run, scan('A-corrected', '50 Corrected St'), beginReceiptEntry(run.orders, 'A'));
  const removed = removeReceiptOrder(replaced.orders, replaced.fingerprints, 'B');
  const restored = decodeActiveSession(encodeActiveSession(removed.orders, removed.fingerprints, now), now);
  assert.deepEqual(restored.orders.map((order) => order.order_id), ['A-corrected', 'C']);
  assert.deepEqual(restored.fingerprints, removed.fingerprints);
  assert.equal(restored.orders[0].address.unit, 'Apt 2');
  assert.equal(restored.orders[0].placedAt, '2026-10-19T21:30:00Z');
  assert.doesNotThrow(() => save(restored, scan('B')));
});
