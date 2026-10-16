import assert from 'node:assert/strict';
import test from 'node:test';
import { optimizeRoute } from '../src/services/routeApi.js';
import { validateAddress } from '../src/services/addressApi.js';

const address = { formatted_address: 'Test destination', coordinates: { latitude: 42, longitude: -71 } };
const orders = [{ order_id: 'A', address, placedAt: new Date(Date.now() - 10 * 60_000).toISOString() }];
const route = { ordered_stops: [{ order_id: 'A', address, position: 1 }], total_drive_minutes: 5, explanation: ['Test route'] };
const response = (body = route, ok = true, status = 200) => ({ ok, status, json: async () => body });

test('route request preserves confirmed addresses and sends calculated order ages', async () => {
  const result = await optimizeRoute(address, orders, { fetchImpl: async (url, request) => {
    assert.ok(url.endsWith('/routes/optimize'));
    const body = JSON.parse(request.body);
    assert.deepEqual(body.start, address);
    assert.deepEqual(body.orders[0].address, address);
    assert.equal(body.orders[0].age_minutes, 10);
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
