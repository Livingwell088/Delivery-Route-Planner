// Driven by tests/test_phase7_acceptance.py against an isolated HTTP backend.
// Google transport is mocked by that harness; never run against a live backend.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { validateAddress, confirmAddress } from '../src/services/addressApi.js';
import { optimizeRoute } from '../src/services/routeApi.js';
import { createAddressReviewController, selectedAddressCandidate, addressReviewError,
  confirmAddressForOrder } from '../src/services/addressReview.js';
import { encodeActiveSession, decodeActiveSession } from '../src/services/activeSession.js';
import { formatPlacedTime } from '../src/services/placedTime.js';
import { createNavigationRoute } from '../src/services/navigationLinks.js';

assert.equal(process.env.PHASE7_ACCEPTANCE, 'mock-provider', 'Use the Python acceptance harness');
const [phase, sessionFile] = process.argv.slice(2);
const root = process.env.EXPO_PUBLIC_API_URL;
const usage = async () => (await fetch(`${root}/maps/usage`)).json();
const before = await usage();

if (phase === 'prepare') {
  const orders = [];
  for (const [id, input] of [
    ['A', '  10 Example St Apt 2, Worcester, MA 01608  '],
    ['B', '20 Example St Suite 3, Worcester, MA 01608'],
    ['C', '40 Example St, Worcester, MA 01608'],
  ]) {
    let review;
    const controller = createAddressReviewController({ validate: validateAddress, onChange: (next) => { review = next; } });
    await controller.lookup(input);
    if (id === 'C') {
      assert.equal(review.status, 'needs_selection');
      assert.equal(review.selectedCandidateId, null);
      assert.ok(addressReviewError(review, input));
      controller.select(review.candidates[1].candidate_id);
    }
    assert.equal(addressReviewError(review, input), null);
    const selected = selectedAddressCandidate(review, input);
    const address = await confirmAddress(input, review.lookupReference, selected.candidate_id);
    const draft = { order_id: id, placedAt: new Date().toISOString(), address: { formatted_address: input } };
    orders.push(confirmAddressForOrder(draft, review, address));
  }
  const originLookup = await validateAddress('30 Example St, Worcester, MA 01608');
  const origin = await confirmAddress('30 Example St, Worcester, MA 01608', originLookup.lookup_reference,
    originLookup.candidates[0].candidate_id);
  const route = await optimizeRoute(origin, orders);
  assert.equal(route.ordered_stops.length, 3);
  assert.deepEqual(new Set(route.ordered_stops.map((stop) => stop.order_id)), new Set(['A', 'B', 'C']));
  assert.equal(orders[0].address.unit, 'Apt 2');
  assert.equal(orders[1].address.unit, 'Suite 3');
  assert.ok(orders[2].address.validated_location.place_id.endsWith('-alternative'));
  for (const stop of route.ordered_stops) {
    assert.deepEqual(stop.address, orders.find((order) => order.order_id === stop.order_id).address);
  }
  const google = new URL(createNavigationRoute('google', route.ordered_stops, origin).url);
  assert.equal(google.searchParams.get('origin'), `${origin.coordinates.latitude},${origin.coordinates.longitude}`);
  assert.equal(google.searchParams.get('destination'), google.searchParams.get('origin'));
  assert.deepEqual(google.searchParams.get('waypoints').split('|'), route.ordered_stops.map((stop) =>
    `${stop.address.coordinates.latitude},${stop.address.coordinates.longitude}`));
  const appleRoute = createNavigationRoute('apple', route.ordered_stops, origin, { OS: 'ios', Version: '18.4' });
  assert.equal(appleRoute.includesAllStops, true);
  const apple = new URL(appleRoute.url);
  assert.equal(apple.searchParams.get('source'), origin.formatted_address);
  assert.deepEqual(apple.searchParams.getAll('waypoint'), route.ordered_stops.map((stop) => stop.address.formatted_address));
  assert.match(formatPlacedTime(orders[0].placedAt), /\d+:\d{2}\s[AP]M/);

  let invalidReview;
  const invalid = createAddressReviewController({ validate: validateAddress, onChange: (next) => { invalidReview = next; } });
  await invalid.lookup('99 Example St, Worcester, MA 01608');
  assert.equal(invalidReview.status, 'invalid');
  assert.ok(addressReviewError(invalidReview, invalidReview.input));
  const after = await usage();
  assert.equal(after.reserved_units.geocoding - before.reserved_units.geocoding, 5);
  assert.equal(after.reserved_units.route_matrix - before.reserved_units.route_matrix, 16);
  const snapshot = encodeActiveSession(orders, ['receipt-a']);
  assert.equal(decodeActiveSession(snapshot).orders.length, 3);
  await writeFile(sessionFile, JSON.stringify({ snapshot, origin, usage: after }), 'utf8');
  console.log('PASS: mobile lookup, selection, confirmation, unit retention, route, invalid address and session save');
} else {
  const saved = JSON.parse(await readFile(sessionFile, 'utf8'));
  const restored = decodeActiveSession(saved.snapshot);
  assert.equal(restored.orders.length, 3);
  assert.deepEqual(before.reserved_units, saved.usage.reserved_units);
  if (phase === 'resume') {
    const route = await optimizeRoute(saved.origin, restored.orders);
    assert.equal(route.ordered_stops.length, 3);
    const after = await usage();
    assert.equal(after.reserved_units.geocoding, before.reserved_units.geocoding);
    assert.equal(after.reserved_units.route_matrix - before.reserved_units.route_matrix, 16);
    const changed = structuredClone(restored.orders);
    changed[0].address.unit = 'Changed unit';
    await assert.rejects(optimizeRoute(saved.origin, changed), (error) => error.code === 'location_review_required');
    assert.deepEqual((await usage()).reserved_units, after.reserved_units);
    saved.usage = after;
    await writeFile(sessionFile, JSON.stringify(saved), 'utf8');
    console.log('PASS: app/backend restore, signed references, durable accounting, no re-geocoding and tampering rejection');
  } else if (phase === 'blocked') {
    await assert.rejects(optimizeRoute(saved.origin, restored.orders), (error) => error.code === 'map_usage_limit_reached');
    assert.deepEqual(decodeActiveSession(saved.snapshot), restored);
    assert.deepEqual((await usage()).reserved_units, before.reserved_units);
    console.log('PASS: monthly cutoff preserves orders and blocks provider usage');
  } else {
    throw new Error('Unknown acceptance phase');
  }
}
