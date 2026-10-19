import assert from 'node:assert/strict';
import test from 'node:test';
import { optimizeRoute as submitOptimizedRoute, evaluateRoute as submitEvaluatedRoute } from '../src/services/routeApi.js';
import { validateAddress } from '../src/services/addressApi.js';

const address = { formatted_address: 'Test destination', coordinates: { latitude: 42, longitude: -71 } };
const departureAt = '2026-10-19T22:00:00Z';
const orders = [{ order_id: 'A', address, placedAt: '2026-10-19T21:50:00Z' }];
const optimizeRoute = (start, orders, options) => submitOptimizedRoute(start, orders, { departureAt, ...options });
const evaluateRoute = (start, orders, sequence, options) => submitEvaluatedRoute(start, orders, sequence, { departureAt, ...options });
const route = { ordered_stops: [{ order_id: 'A', address, position: 1, drive_minutes_from_start: 3,
  drive_minutes_from_previous_stop: 3, placed_at: orders[0].placedAt, arrival_at: '2026-10-19T22:03:00Z',
  predicted_order_age_minutes: 13, predicted_wait_minutes: 13, late_minutes: 0, age_basis: 'placed_at' }],
  total_drive_minutes: 5, explanation: ['Test route'], score: 18, start: address,
  departure_at: departureAt, calculated_at: departureAt, return_drive_minutes: 2, return_at: '2026-10-19T22:05:00Z',
  route_mode: 'optimized', travel_time_basis: 'development_estimate', stop_service_minutes: 0 };
const response = (body = route, ok = true, status = 200) => ({ ok, status, json: async () => body });

test('route request preserves confirmed addresses and sends placed time with a shared departure', async () => {
  const result = await optimizeRoute(address, orders, { fetchImpl: async (url, request) => {
    assert.ok(url.endsWith('/routes/optimize'));
    const body = JSON.parse(request.body);
    assert.deepEqual(body.start, address);
    assert.deepEqual(body.orders[0].address, address);
    assert.equal(body.orders[0].placed_at, orders[0].placedAt);
    assert.equal(body.departure_at, departureAt);
    assert.equal('age_minutes' in body.orders[0], false);
    assert.ok(request.signal);
    return response();
  } });
  assert.deepEqual(result, route);
});

test('budget and tracking errors preserve structured codes and explain recovery', async () => {
  for (const code of ['map_usage_limit_reached', 'map_usage_unavailable']) {
    const fetchImpl = async () => response({ error: { code } }, false, 503);
    await assert.rejects(optimizeRoute(address, orders, { fetchImpl }), (error) => error.code === code && /orders are saved/.test(error.message));
    await assert.rejects(validateAddress('Test', { fetchImpl }), (error) => error.code === code && /details are saved/.test(error.message));
  }
});

test('all placed times retain their precision and use the explicit departure timestamp', async () => {
  const timedOrders = [
    { ...orders[0], placedAt: '2026-10-19T21:30:15.250Z' },
  ];
  await optimizeRoute(address, timedOrders, { departureAt, fetchImpl: async (url, request) => {
    const body = JSON.parse(request.body);
    assert.equal(body.departure_at, departureAt);
    assert.equal(body.orders[0].placed_at, timedOrders[0].placedAt);
    return response({ ...route, ordered_stops: [{ ...route.ordered_stops[0], placed_at: timedOrders[0].placedAt,
      predicted_order_age_minutes: 32, predicted_wait_minutes: 32 }] });
  } });
  await assert.rejects(optimizeRoute(address, timedOrders, { departureAt: 'invalid',
    fetchImpl: () => assert.fail('Invalid departure must not make a request'),
  }), /Invalid route departure/);
});

test('route timeout aborts the request without retrying', async () => {
  let calls = 0;
  const fetchImpl = (url, { signal }) => new Promise((resolve, reject) => {
    calls++;
    signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
  });
  await assert.rejects(optimizeRoute(address, orders, { timeoutMs: 5, fetchImpl }), /timed out/);
  assert.equal(calls, 1);
});

test('network and unreadable route failures provide actionable messages', async () => {
  await assert.rejects(optimizeRoute(address, orders, { fetchImpl: async () => { throw new TypeError('fetch failed'); } }), /Cannot reach/);
  await assert.rejects(optimizeRoute(address, orders, { fetchImpl: async () => ({ json: async () => { throw new SyntaxError('bad JSON'); } }) }), /unreadable/);
});

test('incomplete or wrong-destination route is rejected without altering input orders', async () => {
  const original = structuredClone(orders);
  for (const broken of [null, { ...route, ordered_stops: [] },
    { ...route, total_drive_minutes: -1 }, { ...route, explanation: null },
    { ...route, ordered_stops: [{ order_id: 'Wrong', address }] },
    { ...route, ordered_stops: [{ order_id: 'A', address: {} }] },
  ]) {
    await assert.rejects(optimizeRoute(address, orders, { fetchImpl: async () => response(broken) }), /incomplete route/);
  }
  assert.deepEqual(orders, original);
});

test('location-review errors keep their code for the existing revalidation flow', async () => {
  await assert.rejects(optimizeRoute(address, orders, { fetchImpl: async () => response({ error: {
    code: 'location_review_required', message: 'Confirm again',
  } }, false, 422) }), (error) => error.code === 'location_review_required' && error.message === 'Confirm again');
});

test('fixed-sequence evaluation selects its endpoint, retains stop order, and shares timeout behavior', async () => {
  const original = structuredClone(orders);
  const result = await evaluateRoute(address, orders, ['A'], { fetchImpl: async (url, request) => {
    assert.ok(url.endsWith('/routes/evaluate'));
    assert.deepEqual(JSON.parse(request.body).sequence, ['A']);
    return response({ ...route, route_mode: 'evaluated' });
  } });
  assert.equal(result.route_mode, 'evaluated');
  assert.deepEqual(orders, original);
  await assert.rejects(evaluateRoute(address, orders, ['A'], { timeoutMs: 5,
    fetchImpl: (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    }),
  }), /timed out/);
});

test('invalid sequences and future or invalid placed times are rejected before requesting Google work', async () => {
  const fetchImpl = () => assert.fail('Invalid inputs must not make a request');
  for (const sequence of [null, [], ['A', 'A'], ['unknown']]) {
    await assert.rejects(evaluateRoute(address, orders, sequence, { fetchImpl }), /exactly once/);
  }
  for (const placedAt of ['invalid', '2026-10-19T22:00:01Z']) {
    await assert.rejects(optimizeRoute(address, [{ ...orders[0], placedAt }], { fetchImpl }), /placed times/);
  }
});

test('evaluation rejects a response that silently replaces the requested stop order', async () => {
  const twoOrders = [...orders, { ...orders[0], order_id: 'B' }];
  const twoStops = [route.ordered_stops[0], { ...route.ordered_stops[0], order_id: 'B', position: 2,
    drive_minutes_from_start: 4, drive_minutes_from_previous_stop: 1, arrival_at: '2026-10-19T22:04:00Z',
    predicted_order_age_minutes: 14, predicted_wait_minutes: 14 }];
  const body = { ...route, ordered_stops: twoStops, total_drive_minutes: 6, return_at: '2026-10-19T22:06:00Z', route_mode: 'evaluated' };
  await assert.rejects(evaluateRoute(address, twoOrders, ['B', 'A'], { fetchImpl: async () => response(body) }), /incomplete route/);
  assert.deepEqual((await evaluateRoute(address, twoOrders, ['A', 'B'], { fetchImpl: async () => response(body) }))
    .ordered_stops.map((stop) => stop.order_id), ['A', 'B']);
});

test('clock, age, leg, return, mode and destination inconsistencies fail closed', async () => {
  const mutations = [
    (r) => { delete r.departure_at; },
    (r) => { r.departure_at = '2026-10-19T22:01:00Z'; },
    (r) => { r.return_at = '2026-10-19T22:06:00Z'; },
    (r) => { r.return_drive_minutes = 3; },
    (r) => { r.route_mode = 'evaluated'; },
    (r) => { r.stop_service_minutes = 1; },
    (r) => { r.start.formatted_address = 'Wrong restaurant'; },
    (r) => { r.ordered_stops[0].arrival_at = '2026-10-19T22:04:00Z'; },
    (r) => { r.ordered_stops[0].placed_at = departureAt; },
    (r) => { r.ordered_stops[0].predicted_order_age_minutes = 14; },
    (r) => { r.ordered_stops[0].predicted_wait_minutes = 14; },
    (r) => { r.ordered_stops[0].drive_minutes_from_previous_stop = 4; },
    (r) => { r.ordered_stops[0].position = 2; },
    (r) => { r.ordered_stops[0].address.unit = 'Wrong unit'; },
    (r) => { r.ordered_stops[0].address.formatted_address = 42; },
  ];
  for (const mutate of mutations) {
    const broken = structuredClone(route);
    mutate(broken);
    await assert.rejects(optimizeRoute(address, orders, { fetchImpl: async () => response(broken) }), /incomplete route/);
  }
});
