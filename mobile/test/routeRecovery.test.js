import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoutePlan, changeRouteInputs, beginRouteRequest, prepareRouteRequest, completeRouteRequest,
  expireRoutePlan, nextConfirmationExpiry, canNavigateRoute } from '../src/services/routePlan.js';
import { openRouteNavigation as handoff } from '../src/services/navigationHandoff.js';
const openRouteNavigation = (options) => handoff({ platform: { OS: 'android', Version: 35 }, canOpenURL: async () => true,
  androidMaps: { isAvailable: async () => true, open: (url) => options.openURL(url) }, ...options });
import { createSessionPersistence } from '../src/services/activeSession.js';

const now = Date.parse('2026-10-20T18:00:00Z');
const address = (label, minutes = 30) => ({ formatted_address: label, coordinates: { latitude: 42, longitude: -71 },
  validated_location: { provider: 'google', validation_reference: 'signed', expires_at: new Date(now + minutes * 60000).toISOString() } });
function currentRun() {
  const restaurant = address('Restaurant', 60);
  const orders = ['A', 'B'].map((order_id, index) => ({ order_id, placedAt: new Date(now - 60000).toISOString(), address: { ...address(`${order_id} · Apt 2`), coordinates: { latitude: 42 + index / 10, longitude: -71 } } }));
  let plan = beginRouteRequest(changeRouteInputs(createRoutePlan(), orders, restaurant), 'evaluate');
  plan = prepareRouteRequest(plan, plan, orders, restaurant, new Date(now).toISOString());
  plan = completeRouteRequest(plan, plan, { ordered_stops: orders.map((order) => ({ ...order })), total_drive_minutes: 10 });
  return { plan, orders, restaurant };
}

test('expiry invalidates route estimates at the exact boundary without losing sequence or orders', () => {
  const run = currentRun();
  assert.equal(nextConfirmationExpiry(run.orders, run.restaurant, now), now + 30 * 60000);
  assert.equal(expireRoutePlan(run.plan, run.orders, run.restaurant, now), run.plan);
  const expired = expireRoutePlan(run.plan, run.orders, run.restaurant, now + 30 * 60000);
  assert.equal(expired.status, 'needs_calculation');
  assert.equal(expired.route, null);
  assert.deepEqual(expired.sequence, ['A', 'B']);
  assert.equal(run.orders.length, 2);
  assert.equal(canNavigateRoute(expired, run.orders, run.restaurant, now), false);
  assert.equal(nextConfirmationExpiry(run.orders, run.restaurant, now + 30 * 60000), now + 60 * 60000);
  assert.equal(nextConfirmationExpiry(run.orders, run.restaurant, now + 60 * 60000), null);
});

test('expiry presentation does not interrupt a request refreshing old confirmations', () => {
  const run = currentRun();
  const pending = beginRouteRequest(run.plan, 'evaluate');
  assert.equal(expireRoutePlan(pending, run.orders, run.restaurant, now + 60 * 60000), pending);
});

test('navigation exports current evaluated buildings and confirmed restaurant', async () => {
  const run = currentRun();
  const urls = [];
  const result = await openRouteNavigation({ getCurrent: () => run, navigationApp: 'apple',
    platform: { OS: 'ios', Version: '18.4' }, now: () => now, openURL: async (url) => { urls.push(url); } });
  assert.equal(result.status, 'opened');
  const url = new URL(urls[0]);
  assert.equal(url.searchParams.get('origin'), '42,-71');
  assert.equal(url.searchParams.get('destination'), '42,-71');
  assert.deepEqual(url.searchParams.get('waypoints').split('|'), ['42,-71', '42.1,-71']);
});

test('expired and changed routes are blocked even when time passes during the fallback notice', async () => {
  for (const change of ['expire', 'replace']) {
    let run = currentRun();
    let clock = now;
    const result = await openRouteNavigation({ getCurrent: () => run, navigationApp: 'apple',
      platform: { OS: 'ios', Version: '18.3' }, now: () => clock,
      canOpenURL: async () => false, chooseAlternative: async ({ alternatives }) => alternatives[0],
      notifyFallback: async () => {
        if (change === 'expire') clock = now + 30 * 60000;
        else run = { ...run, plan: { ...run.plan } };
      }, openURL: () => assert.fail('Obsolete route must not launch'),
    });
    assert.equal(result.status, 'needs_calculation');
  }
});

test('Maps launch rejection retains the route and allows a later retry', async () => {
  const run = currentRun();
  const original = structuredClone(run);
  const options = { getCurrent: () => run, navigationApp: 'google', now: () => now };
  const result = await openRouteNavigation({ ...options, openURL: async () => { throw new Error('No handler'); } });
  assert.equal(result.status, 'failed');
  assert.deepEqual(run, original);
  assert.equal((await openRouteNavigation({ ...options, openURL: async () => {} })).status, 'opened');
});

test('failed restore cannot be followed by an empty overwrite; retry recovers without deleting saved data', async () => {
  let unavailable = true;
  const writes = [];
  const statuses = [];
  const session = createSessionPersistence({
    async getItem() { if (unavailable) throw new Error('Read failed'); return null; },
    async setItem(key, text) { writes.push(text); },
  }, (status) => statuses.push(status.kind));
  await assert.rejects(session.restore(), /Read failed/);
  assert.equal(await session.save('empty overwrite'), false);
  assert.deepEqual(writes, []);
  assert.equal(statuses.at(-1), 'restore_failed');
  unavailable = false;
  await session.restore();
  assert.equal(await session.save('current run'), true);
  assert.deepEqual(writes, ['current run']);
});

test('only latest queued save updates recovery status, and retry saves the latest run', async () => {
  let fail = true;
  const writes = [];
  const statuses = [];
  const session = createSessionPersistence({ getItem: async () => null,
    async setItem(key, text) { writes.push(text); if (fail) throw new Error('Write failed'); },
  }, (status) => statuses.push(status.kind));
  await session.restore();
  await Promise.all([session.save('older'), session.save('newer')]);
  assert.deepEqual(statuses, ['ready', 'save_failed']);
  fail = false;
  assert.equal(await session.retrySave(), true);
  assert.deepEqual(writes, ['older', 'newer', 'newer']);
  assert.equal(statuses.at(-1), 'ready');
});

test('explicit new-run choice unlocks saving after a restore failure', async () => {
  const writes = [];
  const session = createSessionPersistence({ getItem: async () => { throw new Error('Read failed'); },
    setItem: async (key, text) => { writes.push(text); } });
  await assert.rejects(session.restore());
  session.startNewRun();
  assert.equal(await session.save('explicit new run'), true);
  assert.deepEqual(writes, ['explicit new run']);
});
