// Only run through the Python test with isolated HTTP backend and mocked Google.
import assert from 'node:assert/strict';
import { validateAddress, confirmAddress } from '../src/services/addressApi.js';
import { optimizeRoute, evaluateRoute } from '../src/services/routeApi.js';
import { createRoutePlan, changeRouteInputs, changeRouteSequence, beginRouteRequest,
  prepareRouteRequest, completeRouteRequest } from '../src/services/routePlan.js';
import { formatPlacedTime } from '../src/services/placedTime.js';

assert.equal(process.env.PHASE8_ACCEPTANCE, 'mock-provider', 'Use the Python acceptance harness');
const root = process.env.EXPO_PUBLIC_API_URL;
const usage = async () => (await fetch(`${root}/maps/usage`)).json();
const before = await usage();
const orders = [];
for (const [order_id, number, unit, placedAt] of [
  ['A', 10, 'Apt 2', '2026-10-19T21:30:15.250Z'],
  ['B', 20, 'Suite 3', '2026-10-19T21:45:00Z'],
  ['C', 40, '', '2026-10-19T21:50:00Z'],
]) {
  const input = `${number} Example St ${unit}, Worcester, MA 01608`;
  const lookup = await validateAddress(input);
  const candidate = lookup.candidates[number === 40 ? 1 : 0];
  const address = await confirmAddress(input, lookup.lookup_reference, candidate.candidate_id);
  orders.push({ order_id, address, placedAt });
}
const input = '30 Example St, Worcester, MA 01608';
const lookup = await validateAddress(input);
const origin = await confirmAddress(input, lookup.lookup_reference, lookup.candidates[0].candidate_id);
const departureAt = '2026-10-19T22:00:00Z';
const optimized = await optimizeRoute(origin, orders, { departureAt });
assert.equal(optimized.route_mode, 'optimized');
const sequence = ['C', 'A', 'B'];
const evaluated = await evaluateRoute(origin, orders, sequence, { departureAt });
assert.deepEqual(evaluated.ordered_stops.map((stop) => stop.order_id), sequence);
assert.equal(evaluated.route_mode, 'evaluated');
assert.equal(evaluated.travel_time_basis, 'traffic_unaware');
assert.equal(evaluated.return_drive_minutes, 4);
assert.equal(evaluated.total_drive_minutes, 16);
assert.equal(formatPlacedTime(evaluated.return_at), '6:16 PM');
assert.deepEqual(evaluated.ordered_stops.map((stop) => stop.predicted_order_age_minutes), [13, 37, 27]);
assert.deepEqual(evaluated.ordered_stops.map((stop) => formatPlacedTime(stop.arrival_at)), ['6:03 PM', '6:08 PM', '6:12 PM']);
assert.equal(evaluated.ordered_stops[1].address.unit, 'Apt 2');
assert.equal(evaluated.ordered_stops[2].address.unit, 'Suite 3');
let plan = changeRouteSequence(changeRouteInputs(createRoutePlan(), orders, origin), sequence, orders);
plan = beginRouteRequest(plan, 'evaluate');
plan = completeRouteRequest(prepareRouteRequest(plan, plan, orders, origin, departureAt), plan, evaluated);
assert.equal(plan.sequenceSource, 'manual');
assert.deepEqual(plan.sequence, sequence);
assert.equal(plan.calculatedAt, evaluated.calculated_at);

const later = await evaluateRoute(origin, orders, sequence, { departureAt: '2026-10-19T22:01:00Z' });
assert.deepEqual(later.ordered_stops.map((stop) => stop.order_id), sequence);
assert.equal(formatPlacedTime(later.return_at), '6:17 PM');
assert.deepEqual(later.ordered_stops.map((stop) => stop.predicted_order_age_minutes), [14, 38, 28]);
const after = await usage();
assert.equal(after.reserved_units.geocoding - before.reserved_units.geocoding, 4);
assert.equal(after.reserved_units.route_matrix - before.reserved_units.route_matrix, 48);
await assert.rejects(evaluateRoute(origin, orders, ['A', 'A', 'C'], { departureAt }), /exactly once/);
const changed = structuredClone(orders);
changed[0].address.unit = 'Changed unit';
await assert.rejects(evaluateRoute(origin, changed, sequence, { departureAt }), (error) => error.code === 'location_review_required');
assert.deepEqual((await usage()).reserved_units, after.reserved_units);
console.log('PASS: shared clocks, precise placed times, manual sequence, directed legs, return, explicit recalculation and usage gates');
