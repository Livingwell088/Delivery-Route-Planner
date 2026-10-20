// Run only with the isolated mocked-provider Python HTTP harness.
import assert from 'node:assert/strict';
import { validateAddress, confirmAddress } from '../src/services/addressApi.js';
import { optimizeRoute, evaluateRoute } from '../src/services/routeApi.js';
import { createRoutePlan, changeRouteInputs, beginRouteRequest, prepareRouteRequest, completeRouteRequest,
  failRouteRequest, canNavigateRoute, moveRouteStop, ordersInRouteOrder } from '../src/services/routePlan.js';
import { encodeActiveSession, decodeActiveSession } from '../src/services/activeSession.js';
import { createNavigationRoute } from '../src/services/navigationLinks.js';

assert.equal(process.env.PHASE8_REORDERING, 'mock-provider', 'Use the Python acceptance harness');
const usage = async () => (await fetch(`${process.env.EXPO_PUBLIC_API_URL}/maps/usage`)).json();
async function location(number) {
  const input = `${number} Example St, Worcester, MA 01608`;
  const lookup = await validateAddress(input);
  return confirmAddress(input, lookup.lookup_reference, lookup.candidates[number === 40 ? 1 : 0].candidate_id);
}
const origin = await location(30);
let orders = [];
for (const [order_id, number] of [['A', 10], ['B', 20], ['C', 40]]) {
  orders.push({ order_id, address: await location(number), placedAt: new Date(Date.now() - 30 * 60000).toISOString() });
}
let plan = changeRouteInputs(createRoutePlan(), orders, origin);
async function calculate(mode, options = {}) {
  plan = beginRouteRequest(plan, mode);
  const ticket = plan;
  const departureAt = new Date().toISOString();
  plan = prepareRouteRequest(plan, ticket, orders, origin, departureAt);
  try {
    const result = mode === 'evaluate' ? await evaluateRoute(origin, orders, plan.sequence, { departureAt, ...options })
      : await optimizeRoute(origin, orders, { departureAt, ...options });
    plan = completeRouteRequest(plan, ticket, result);
  } catch (error) {
    plan = failRouteRequest(plan, ticket, error.message);
  }
}
await calculate('optimize');
assert.equal(plan.status, 'ready');
const beforeMove = await usage();
const chosenFirst = plan.sequence[2];
plan = moveRouteStop(plan, chosenFirst, -1, orders);
plan = moveRouteStop(plan, chosenFirst, -1, orders);
const chosen = [...plan.sequence];
assert.equal(plan.status, 'needs_calculation');
assert.equal(plan.route, null);
assert.equal(canNavigateRoute(plan, orders, origin), false);
assert.deepEqual(ordersInRouteOrder(plan, orders).map((order) => order.order_id), chosen);
assert.deepEqual((await usage()).reserved_units, beforeMove.reserved_units);
await calculate('evaluate', { fetchImpl: async () => { throw new TypeError('Simulated network outage'); } });
assert.equal(plan.status, 'failed');
assert.deepEqual(plan.sequence, chosen);
assert.deepEqual((await usage()).reserved_units, beforeMove.reserved_units);
await calculate('evaluate');
assert.equal(plan.status, 'ready');
assert.deepEqual(plan.sequence, chosen);
assert.equal(plan.sequenceSource, 'manual');
assert.equal(canNavigateRoute(plan, orders, origin), true);
const apple = new URL(createNavigationRoute('apple', plan.route.ordered_stops, origin, { OS: 'ios', Version: '18.4' }).url);
assert.deepEqual(apple.searchParams.getAll('waypoint'), ordersInRouteOrder(plan, orders).map((order) => order.address.formatted_address));

const removed = chosen[1];
orders = orders.filter((order) => order.order_id !== removed);
plan = changeRouteInputs(plan, orders, origin);
assert.deepEqual(plan.sequence, chosen.filter((id) => id !== removed));
assert.equal(plan.route, null);
await calculate('evaluate');
assert.equal(plan.status, 'ready');
assert.deepEqual(plan.sequence, chosen.filter((id) => id !== removed));
const snapshot = encodeActiveSession(orders, [], Date.now(), { sequence: plan.sequence, source: plan.sequenceSource });
const restored = decodeActiveSession(snapshot);
orders = restored.orders;
plan = changeRouteInputs(createRoutePlan(), orders, origin, restored.routePreference);
assert.equal(plan.status, 'needs_calculation');
assert.deepEqual(plan.sequence, chosen.filter((id) => id !== removed));
const remaining = [...plan.sequence];
orders = [...orders, { order_id: 'D', address: await location(50), placedAt: new Date().toISOString() }];
plan = changeRouteInputs(plan, orders, origin);
assert.deepEqual(plan.sequence, [...remaining, 'D']);
await calculate('evaluate');
assert.equal(plan.status, 'ready');
assert.deepEqual(plan.sequence, [...remaining, 'D']);
await calculate('optimize');
assert.equal(plan.status, 'ready');
assert.equal(plan.sequenceSource, 'optimized');
assert.equal(plan.route.route_mode, 'optimized');
assert.deepEqual(new Set(plan.sequence), new Set(orders.map((order) => order.order_id)));
orders = [];
plan = changeRouteInputs(plan, orders, origin);
assert.equal(plan.status, 'empty');
assert.equal(plan.route, null);
assert.equal(canNavigateRoute(plan, orders, origin), false);
assert.deepEqual((await usage()).reserved_units, { geocoding: 5, route_matrix: 73 });
console.log('PASS: reordering, invalidation, failed evaluation/retry, navigation order, removal, persistence, append and explicit optimization');
