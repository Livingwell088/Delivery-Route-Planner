import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoutePlan, changeRouteInputs, changeRouteSequence, beginRouteRequest,
  prepareRouteRequest, completeRouteRequest, failRouteRequest, cancelRouteRequest,
  canNavigateRoute } from '../src/services/routePlan.js';

const now = Date.parse('2026-10-19T22:00:00Z');
const departureAt = new Date(now).toISOString();
const address = { formatted_address: '10 Example St', unit: 'Apt 2',
  coordinates: { latitude: 42, longitude: -71 }, validated_location: {
    place_id: 'place-a', validation_reference: 'signed', expires_at: new Date(now + 3600000).toISOString(),
  } };
const orders = ['A', 'B'].map((order_id) => ({ order_id, address, placedAt: '2026-10-19T21:30:00Z' }));
const result = { ordered_stops: orders.map((order, index) => ({ ...order, position: index + 1 })),
  total_drive_minutes: 24, explanation: ['Test route'] };
const inputs = () => changeRouteInputs(createRoutePlan(), orders, address);
function ready() {
  const pending = beginRouteRequest(inputs());
  return completeRouteRequest(prepareRouteRequest(pending, pending, orders, address, departureAt), pending, result, departureAt);
}

test('ready plan has one fixed departure basis and can navigate only its exact confirmed inputs', () => {
  const plan = ready();
  assert.equal(plan.status, 'ready');
  assert.equal(plan.departureAt, departureAt);
  assert.equal(canNavigateRoute(plan, orders, address, now), true);
  assert.equal(canNavigateRoute(plan, orders, address, now + 3600000), false);
  assert.equal(plan.departureAt, departureAt); // Passing time never silently rebases the plan.
  assert.equal(canNavigateRoute(plan, orders.slice(1), address, now), false);
});

test('adding, removing, replacing, editing placed time/unit/location/origin invalidate calculated estimates', () => {
  const plan = ready();
  const variants = [orders.slice(1), [...orders, { ...orders[0], order_id: 'C' }],
    orders.map((o, i) => i ? o : { ...o, placedAt: departureAt }),
    orders.map((o, i) => i ? o : { ...o, address: { ...address, unit: 'Apt 3' } }),
    orders.map((o, i) => i ? o : { ...o, address: { ...address, validated_location: {
      ...address.validated_location, place_id: 'changed',
    } } }),
  ];
  for (const changed of variants) {
    const next = changeRouteInputs(plan, changed, address);
    assert.equal(next.status, 'needs_calculation');
    assert.equal(next.route, null);
    assert.equal(canNavigateRoute(next, changed, address, now), false);
    assert.equal(next.revision, plan.revision + 1);
  }
  assert.equal(changeRouteInputs(plan, orders, { ...address, formatted_address: 'New restaurant' }).status, 'needs_calculation');
  assert.equal(changeRouteInputs(plan, [], address).status, 'empty');
  assert.equal(changeRouteInputs(plan, orders, address), plan);
});

test('canceled and superseded responses and errors cannot overwrite a newer plan', async () => {
  const old = beginRouteRequest(inputs());
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  let plan = cancelRouteRequest(old);
  plan = beginRouteRequest(plan);
  const newer = plan;
  release(result);
  plan = completeRouteRequest(plan, old, await delayed);
  assert.equal(plan, newer);
  assert.equal(failRouteRequest(plan, old, 'late error'), newer);
  assert.equal(prepareRouteRequest(plan, old, orders, address, departureAt), newer);
  const changed = changeRouteInputs(plan, orders.slice(1), address);
  assert.equal(completeRouteRequest(changed, newer, result), changed);
});

test('failed and canceled calculations retain orders sequence without exporting old results', () => {
  const pending = beginRouteRequest(ready());
  const failed = failRouteRequest(pending, pending, 'Backend unavailable');
  assert.equal(failed.status, 'failed');
  assert.deepEqual(failed.sequence, ['A', 'B']);
  assert.equal(failed.error, 'Backend unavailable');
  assert.equal(canNavigateRoute(failed, orders, address, now), false);
  assert.equal(cancelRouteRequest(pending).status, 'needs_calculation');
  assert.throws(() => beginRouteRequest(createRoutePlan()), /Add an order/);
});

test('manual sequence survives changes and evaluation; only explicit optimization replaces it', () => {
  const manual = changeRouteSequence(ready(), ['B', 'A'], orders);
  assert.equal(manual.status, 'needs_calculation');
  assert.equal(manual.sequenceSource, 'manual');
  assert.deepEqual(changeRouteInputs(manual, [...orders, { ...orders[0], order_id: 'C' }], address).sequence, ['B', 'A', 'C']);
  assert.deepEqual(changeRouteInputs(manual, orders.slice(1), address).sequence, ['B']);
  const pending = beginRouteRequest(manual, 'evaluate');
  const prepared = prepareRouteRequest(pending, pending, orders, address, departureAt);
  assert.throws(() => completeRouteRequest(prepared, pending, result), /does not match/);
  const evaluated = completeRouteRequest(prepared, pending, { ...result, ordered_stops: [...result.ordered_stops].reverse() });
  assert.deepEqual(evaluated.sequence, ['B', 'A']);
  assert.equal(evaluated.sequenceSource, 'manual');
  const optimizing = beginRouteRequest(manual, 'optimize');
  const optimized = completeRouteRequest(prepareRouteRequest(optimizing, optimizing, orders, address, departureAt), optimizing, result);
  assert.deepEqual(optimized.sequence, ['A', 'B']);
  assert.equal(optimized.sequenceSource, 'optimized');
  assert.throws(() => changeRouteSequence(manual, ['A', 'A'], orders), /exactly once/);
});

test('request can adopt refreshed confirmations without accepting an older input revision', () => {
  const pending = beginRouteRequest(inputs());
  const refreshed = { ...address, validated_location: { ...address.validated_location,
    validation_reference: 'refreshed', expires_at: new Date(now + 7200000).toISOString() } };
  const prepared = prepareRouteRequest(pending, pending, orders, refreshed, departureAt);
  const plan = completeRouteRequest(prepared, pending, result);
  assert.equal(canNavigateRoute(plan, orders, refreshed, now), true);
  assert.equal(canNavigateRoute(plan, orders, address, now), false);
});
