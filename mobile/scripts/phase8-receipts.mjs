// Synthetic extraction -> mobile receipt services -> HTTP -> mocked Google only.
import assert from 'node:assert/strict';
import { beginReceiptEntry, prepareReceiptEntry, commitReceiptEntry, receiptFingerprintsForEntry,
  receiptEntryRoutePreference, removeReceiptOrder } from '../src/services/receiptEntry.js';
import { createOrderDraftFromReceipt } from '../src/services/receiptOrderDraft.js';
import { createReceiptFingerprint } from '../src/services/receiptDuplicate.js';
import { createAddressReviewController, selectedAddressCandidate, confirmAddressForOrder } from '../src/services/addressReview.js';
import { validateAddress, confirmAddress } from '../src/services/addressApi.js';
import { optimizeRoute, evaluateRoute } from '../src/services/routeApi.js';
import { changeRouteInputs, createRoutePlan, changeRouteSequence } from '../src/services/routePlan.js';
import { encodeActiveSession, decodeActiveSession } from '../src/services/activeSession.js';

assert.equal(process.env.PHASE8_RECEIPTS, 'mock-provider', 'Use the Python acceptance harness');
const root = process.env.EXPO_PUBLIC_API_URL;
const usage = async () => (await fetch(`${root}/maps/usage`)).json();
let run = { orders: [], fingerprints: [] };
let plan = createRoutePlan();

function scan(order_id, number, unit = '', time = '2026-10-19T21:30:00Z') {
  return { addressCandidates: [{ id: 'address', streetAddress: `${number} Example St${unit ? ` ${unit}` : ''}`,
    city: 'Worcester', state: 'MA', postalCode: '01608', confidence: { value: .95 } }],
    timestampCandidates: [{ id: 'time', timestamp: time, confidence: { value: .95 } }],
    orderNumberCandidates: [{ id: 'number', orderNumber: order_id, confidence: { value: .95 } }],
    selectedAddressCandidateId: 'address', selectedTimestampCandidateId: 'time', selectedOrderNumberCandidateId: 'number' };
}
const scans = [scan('A', 10, 'Apt 2'), scan('B', 20, 'Suite 3'), scan('C', 40)];

async function save(result, replacementOrderId = null, edit = (draft) => draft) {
  const entry = beginReceiptEntry(run.orders, replacementOrderId);
  const draft = edit(createOrderDraftFromReceipt(result, undefined, { allowCorrection: true }));
  const prepared = prepareReceiptEntry(run.orders, run.fingerprints, entry, draft, result);
  let review;
  const controller = createAddressReviewController({ validate: validateAddress, onChange: (next) => { review = next; } });
  await controller.lookup(prepared.draft.address.formatted_address);
  if (review.status === 'needs_selection') controller.select(review.candidates[1].candidate_id);
  const selected = selectedAddressCandidate(review, prepared.draft.address.formatted_address);
  const address = await confirmAddress(prepared.draft.address.formatted_address, review.lookupReference, selected.candidate_id);
  const confirmed = confirmAddressForOrder(prepared.draft, review, address);
  const next = commitReceiptEntry(run.orders, run.fingerprints, entry, confirmed, prepared.receiptFingerprints);
  plan = changeRouteInputs(plan, next.orders, null, receiptEntryRoutePreference(plan, entry, confirmed.order_id));
  run = next;
}

for (const result of scans) await save(result);
assert.deepEqual(run.orders.map((order) => order.order_id), ['A', 'B', 'C']);
const restaurantInput = '30 Example St, Worcester, MA 01608';
const lookup = await validateAddress(restaurantInput);
const origin = await confirmAddress(restaurantInput, lookup.lookup_reference, lookup.candidates[0].candidate_id);
await optimizeRoute(origin, run.orders, { departureAt: '2026-10-19T22:00:00Z' });
plan = changeRouteSequence(plan, ['C', 'A', 'B'], run.orders);
const original = structuredClone(run);
const entry = beginReceiptEntry(run.orders, 'A');
const forRecognition = receiptFingerprintsForEntry(run.orders, run.fingerprints, 'A');
assert.equal(forRecognition.includes(createReceiptFingerprint(scans[0])), false);
assert.equal(forRecognition.includes(createReceiptFingerprint(scans[1])), true);
const prepared = prepareReceiptEntry(run.orders, run.fingerprints, entry,
  createOrderDraftFromReceipt(scans[0], undefined, { allowCorrection: true }), scans[0]);
await assert.rejects(confirmAddress(prepared.draft.address.formatted_address, 'expired-reference', 'any'),
  (error) => error.code === 'location_review_required');
assert.deepEqual(run, original);
const beforeDuplicate = await usage();
assert.throws(() => prepareReceiptEntry(run.orders, run.fingerprints, entry,
  createOrderDraftFromReceipt(scans[1], undefined, { allowCorrection: true }), scans[1]), /already/);
assert.deepEqual((await usage()).reserved_units, beforeDuplicate.reserved_units);

await save(scan('A-corrected', 10, 'Apt 4', '2026-10-19T21:35:00Z'), 'A',
  (draft) => ({ ...draft, placedAt: '2026-10-19T21:36:00Z' }));
assert.equal(run.orders.length, 3);
assert.deepEqual(run.orders.map((order) => order.order_id), ['A-corrected', 'B', 'C']);
assert.deepEqual(plan.sequence, ['C', 'A-corrected', 'B']);
assert.equal(plan.sequenceSource, 'manual');
assert.equal(plan.status, 'needs_calculation');
assert.equal(run.orders[0].address.unit, 'Apt 4');
assert.equal(run.orders[0].placedAt, '2026-10-19T21:36:00Z');
assert.equal(run.fingerprints.includes(createReceiptFingerprint(scans[0])), false);
const evaluated = await evaluateRoute(origin, run.orders, plan.sequence, { departureAt: '2026-10-19T22:00:00Z' });
assert.deepEqual(evaluated.ordered_stops.map((stop) => stop.order_id), plan.sequence);

run = removeReceiptOrder(run.orders, run.fingerprints, 'B');
const restored = decodeActiveSession(encodeActiveSession(run.orders, run.fingerprints, Date.now(), {
  sequence: ['C', 'A-corrected'], source: 'manual',
}));
assert.deepEqual(restored.orders.map((order) => order.order_id), ['A-corrected', 'C']);
assert.deepEqual(restored.routePreference.sequence, ['C', 'A-corrected']);
assert.deepEqual(restored.fingerprints, run.fingerprints);
run = restored;
await save(scans[1]);
assert.equal(run.orders.length, 3);
assert.equal(run.orders.filter((order) => order.order_id === 'B').length, 1);
assert.deepEqual((await usage()).reserved_units, { geocoding: 6, route_matrix: 32 });
console.log('PASS: three receipt confirmations, failed rescan, duplicate gate, atomic replacement, sequence preservation, units/time and removal/restore/re-add');
