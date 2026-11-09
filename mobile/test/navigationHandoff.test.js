import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createNavigationPreference, navigationAppOptions } from '../src/services/navigationPreferences.js';
import { navigationAvailability } from '../src/services/navigationCapabilities.js';
import { openRouteNavigation } from '../src/services/navigationHandoff.js';
import { createRoutePlan, changeRouteInputs, beginRouteRequest, prepareRouteRequest, completeRouteRequest } from '../src/services/routePlan.js';
const require = createRequire(import.meta.url);
const { registerPackage, addMapsQuery } = require('../plugins/withNavigationApps.cjs');
const now = Date.parse('2026-10-20T18:00:00Z');
const ios = { OS: 'ios', Version: '18.4' };
const android = { OS: 'android', Version: 35 };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
function fixture() {
  const address = (index) => ({ formatted_address: `Building ${index}`, coordinates: { latitude: 42 + index / 10, longitude: -71 },
    validated_location: { expires_at: new Date(now + 60000).toISOString(), validation_reference: 'signed', provider: 'google' } });
  const restaurant = address(0);
  const orders = [1, 2].map((index) => ({ order_id: String(index), placedAt: new Date(now - 1000).toISOString(), address: address(index) }));
  let plan = beginRouteRequest(changeRouteInputs(createRoutePlan(), orders, restaurant), 'evaluate');
  plan = prepareRouteRequest(plan, plan, orders, restaurant, new Date(now).toISOString());
  plan = completeRouteRequest(plan, plan, { ordered_stops: orders, total_drive_minutes: 10 });
  return { plan, orders, restaurant, navigationApp: 'google', destinationIndex: 0, active: true };
}
function setup(overrides = {}) {
  let run = fixture();
  const urls = [];
  const options = { getCurrent: () => run, navigationApp: 'google', platform: ios, now: () => now,
    canOpenURL: async () => true, openURL: async (url) => urls.push(url), ...overrides };
  return { options, urls, change: (next) => { run = { ...run, ...next }; }, get: () => run };
}

test('availability distinguishes native handlers, unsupported platforms and unknown checks', async () => {
  const probes = [];
  assert.equal(await navigationAvailability('google', ios, { canOpenURL: async (url) => { probes.push(url); return true; } }), 'available');
  assert.equal(await navigationAvailability('apple', ios, { canOpenURL: async (url) => { probes.push(url); return false; } }), 'unavailable');
  assert.deepEqual(probes, ['comgooglemapsurl://', 'maps://']);
  assert.equal(await navigationAvailability('google', ios, { canOpenURL: async () => { throw Error(); } }), 'unknown');
  assert.equal(await navigationAvailability('google', android), 'unknown');
  assert.equal(await navigationAvailability('google', android, { androidMaps: { isAvailable: async () => false } }), 'unavailable');
  assert.equal(await navigationAvailability('apple', android, { canOpenURL: () => assert.fail() }), 'unavailable');
  assert.equal(await navigationAvailability('invalid', ios), 'unavailable');
});

test('native Android launches only through the package adapter; Google iOS uses its scheme', async () => {
  const calls = [];
  const androidRun = setup({ platform: android, androidMaps: { isAvailable: async () => true, open: async (url) => calls.push(url) } });
  assert.equal((await openRouteNavigation(androidRun.options)).status, 'opened');
  assert.equal(androidRun.urls.length, 0);
  assert.match(calls[0], /^https:\/\/www.google.com\/maps\/dir\//);
  const appleRun = setup();
  assert.equal((await openRouteNavigation(appleRun.options)).status, 'opened');
  assert.match(appleRun.urls[0], /^comgooglemapsurl:\/\/www.google.com\/maps\/dir\//);
});

test('missing Google app never offers Apple even when its handler is available', async () => {
  const run = setup({ canOpenURL: async (url) => url === 'maps://',
    chooseAlternative: async ({ alternatives }) => { assert.deepEqual(alternatives.map((item) => item.app), ['google']); return alternatives[0]; },
    notifyFallback: async () => true });
  const before = structuredClone(run.get());
  const result = await openRouteNavigation(run.options);
  assert.equal(result.status, 'opened');
  assert.equal(result.app, 'google');
  assert.match(run.urls[0], /^https:\/\/www.google.com\/maps\/dir/);
  assert.deepEqual(run.get(), before);
});

test('stale Apple preference launches Google on iPhone without probing Apple', async () => {
  const probes = [];
  const run = setup({ navigationApp: 'apple', canOpenURL: async (url) => { probes.push(url); return true; } });
  const result = await openRouteNavigation(run.options);
  assert.equal(result.status, 'opened');
  assert.equal(result.app, 'google');
  assert.deepEqual(probes, ['comgooglemapsurl://']);
  assert.match(run.urls[0], /^comgooglemapsurl:\/\/www.google.com\/maps\/dir\//);
});

test('unknown availability and unsupported saved Apple preference permit only explicit fallback', async () => {
  for (const preference of ['google', 'apple']) {
    const run = setup({ navigationApp: preference, platform: android,
      androidMaps: { isAvailable: async () => { throw Error(); } },
      chooseAlternative: async ({ alternatives }) => { assert.equal(alternatives.length, 1); return alternatives[0]; },
      notifyFallback: async () => true });
    const result = await openRouteNavigation(run.options);
    assert.equal(result.status, 'opened');
    assert.equal(result.transport, 'browser');
    assert.equal(new URL(run.urls[0]).searchParams.get('waypoints'), null);
  }
});

test('fallback waits for Continue and canceled/dismissed dialogs never launch', async () => {
  const gate = deferred();
  const run = setup({ navigationApp: 'apple', platform: { OS: 'ios', Version: '18.3' }, canOpenURL: async () => false,
    chooseAlternative: async ({ alternatives }) => alternatives[0], notifyFallback: () => gate.promise });
  const pending = openRouteNavigation(run.options);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(run.urls.length, 0);
  gate.resolve(true);
  assert.equal((await pending).status, 'opened');
  for (const answer of [false, null, undefined]) {
    const cancelled = setup({ navigationApp: 'apple', platform: { OS: 'ios', Version: '18.3' }, canOpenURL: async () => false,
    chooseAlternative: async ({ alternatives }) => alternatives[0], notifyFallback: async () => answer });
    assert.equal((await openRouteNavigation(cancelled.options)).status, 'cancelled');
    assert.equal(cancelled.urls.length, 0);
  }
  const unavailable = setup({ canOpenURL: async () => false, chooseAlternative: async () => null });
  assert.equal((await openRouteNavigation(unavailable.options)).status, 'cancelled');
  assert.equal(unavailable.urls.length, 0);
});

test('route, selection, preference, unmount or expiry changes during a probe block launch', async () => {
  for (const mutation of ['plan', 'destinationIndex', 'navigationApp', 'active', 'expiry']) {
    const gate = deferred();
    let clock = now;
    const run = setup({ canOpenURL: () => gate.promise, now: () => clock });
    const pending = openRouteNavigation(run.options);
    if (mutation === 'plan') run.change({ plan: { ...run.get().plan } });
    else if (mutation === 'expiry') clock = now + 60000;
    else run.change({ [mutation]: mutation === 'destinationIndex' ? 1 : mutation === 'active' ? false : 'apple' });
    gate.resolve(true);
    assert.equal((await pending).status, 'needs_calculation');
    assert.equal(run.urls.length, 0);
  }
});

test('stale route after alternative choice is rejected and injected unoffered alternatives are refused', async () => {
  const run = setup({ canOpenURL: async () => false,
    chooseAlternative: async ({ alternatives }) => { run.change({ plan: { ...run.get().plan } }); return alternatives[0]; } });
  assert.equal((await openRouteNavigation(run.options)).status, 'needs_calculation');
  assert.equal(run.urls.length, 0);
  const invalid = setup({ canOpenURL: async () => false, chooseAlternative: async () => ({ app: 'apple', transport: 'native' }) });
  assert.equal((await openRouteNavigation(invalid.options)).status, 'cancelled');
});

test('failed native launch preserves route and retries only on another request', async () => {
  let attempts = 0;
  const run = setup({ platform: android, androidMaps: { isAvailable: async () => true,
    open: async () => { attempts++; if (attempts === 1) throw Error(); } } });
  const before = structuredClone(run.get());
  assert.equal((await openRouteNavigation(run.options)).status, 'failed');
  assert.equal(attempts, 1);
  assert.deepEqual(run.get(), before);
  assert.equal((await openRouteNavigation(run.options)).status, 'opened');
});

test('explicit other-options request offers native and one-stop choices even when preference is available', async () => {
  let offered = false;
  const run = setup({ forceChoice: true, chooseAlternative: async ({ alternatives }) => { offered = true; return alternatives[0]; } });
  assert.equal((await openRouteNavigation(run.options)).status, 'opened');
  assert.equal(offered, true);
});

test('preference restore cannot overwrite a newer choice; serialized writes end at newest selection', async () => {
  const read = deferred();
  const firstWrite = deferred();
  const changes = [];
  const writes = [];
  const preference = createNavigationPreference({ getItem: () => read.promise, setItem: async (_, value) => {
    writes.push(value); if (writes.length === 1) await firstWrite.promise;
  } }, 'pref', (value) => changes.push(value));
  const restoring = preference.restore();
  const first = preference.select('google');
  const second = preference.select('google');
  read.resolve('apple');
  await restoring;
  assert.deepEqual(changes, ['google', 'google']);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(writes, ['google']);
  firstWrite.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(writes, ['google', 'google']);
});

test('old Apple preferences become Google; unsupported selections cannot be saved; storage failure remains recoverable', async () => {
  for (const value of ['bad', null, 'apple']) {
    const changes = [];
    const pref = createNavigationPreference({ getItem: async () => value }, 'pref', (next) => changes.push(next));
    await pref.restore();
    assert.deepEqual(changes, ['google']);
  }
  const changes = [];
  let failures = 0;
  let fail = true;
  const pref = createNavigationPreference({ getItem: async () => { throw Error(); }, setItem: async () => { if (fail) throw Error(); } },
    'pref', (value) => changes.push(value), () => failures++);
  await pref.restore();
  assert.deepEqual(changes, []);
  assert.equal(await pref.select('invalid'), false);
  assert.equal(await pref.select('apple'), false);
  assert.deepEqual(changes, []);
  assert.equal(await pref.select('google'), false);
  assert.equal(failures, 1);
  assert.deepEqual(changes, ['google']);
  fail = false;
  assert.equal(await pref.select('google'), true);
  assert.deepEqual(navigationAppOptions(android).map((option) => option.value), ['google']);
  assert.deepEqual(navigationAppOptions(ios).map((option) => option.value), ['google']);
});

test('native plugin preserves existing queries and registers exactly once; changed template fails explicitly', () => {
  const existing = { queries: [{ intent: [{ action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }] }] }] };
  addMapsQuery(existing);
  addMapsQuery(existing);
  assert.equal(existing.queries.length, 1);
  assert.equal(existing.queries[0].package.length, 1);
  assert.equal(existing.queries[0].intent.length, 1);
  const content = registerPackage('PackageList(this).packages.apply {\n}');
  assert.equal(registerPackage(content), content);
  assert.throws(() => registerPackage('changed template'), /not found/);
});

test('an obsolete preference write failure cannot report a newer successful choice as unsaved', async () => {
  const gate = deferred();
  let failures = 0;
  let writes = 0;
  const pref = createNavigationPreference({ setItem: async () => {
    if (++writes === 1) { await gate.promise; throw Error(); }
  } }, 'pref', () => {}, () => failures++);
  const first = pref.select('google');
  const second = pref.select('google');
  gate.resolve();
  assert.deepEqual(await Promise.all([first, second]), [false, true]);
  assert.equal(failures, 0);
});

test('iOS introspection preserves existing scheme queries and declares both navigation probes', async () => {
  const { compileModsAsync } = require('expo/config-plugins');
  const plugin = require('../plugins/withNavigationApps.cjs');
  const result = await compileModsAsync(plugin({ name: 'RouteRunner', slug: 'route-runner',
    ios: { bundleIdentifier: 'com.livingwell088.routerunner', infoPlist: { LSApplicationQueriesSchemes: ['existing'] } },
  }), { projectRoot: process.cwd(), platforms: ['ios'], introspect: true });
  assert.deepEqual(result._internal.modResults.ios.infoPlist.LSApplicationQueriesSchemes, ['existing', 'comgooglemapsurl', 'maps']);
});

test('single-destination handoff opens each selected delivery and restaurant without advancing or repeating a fallback notice', async () => {
  for (const destinationIndex of [0, 1, 2]) {
    const run = setup({ mode: 'single_destination', destinationIndex,
      notifyFallback: () => assert.fail('Explicit single mode needs no downgrade notice') });
    const before = structuredClone(run.get());
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await openRouteNavigation(run.options);
      assert.equal(result.status, 'opened');
      assert.equal(result.destinationIndex, destinationIndex);
      const query = new URL(run.urls[attempt]).searchParams;
      assert.equal(query.get('destination'), ['42.1,-71', '42.2,-71', '42,-71'][destinationIndex]);
      assert.equal(query.get('origin'), null);
    }
    assert.deepEqual(run.get(), before);
  }
});

test('failed fallback launch returns the same destination metadata for a safe UI retry', async () => {
  const run = setup({ navigationApp: 'apple', platform: { OS: 'ios', Version: '18.3' },
    canOpenURL: async () => false, chooseAlternative: async ({ alternatives }) => alternatives[0],
    notifyFallback: async () => true, openURL: async () => { throw Error(); } });
  const result = await openRouteNavigation(run.options);
  assert.equal(result.status, 'failed');
  assert.equal(result.mode, 'single_destination');
  assert.equal(result.destinationIndex, 0);
  assert.equal(run.get().plan.status, 'ready');
});

test('changing navigation mode while an asynchronous probe is pending invalidates that launch', async () => {
  const gate = deferred();
  const run = setup({ canOpenURL: () => gate.promise });
  run.change({ navigationSelection: { mode: 'full_route', destinationIndex: 0 } });
  const pending = openRouteNavigation(run.options);
  run.change({ navigationSelection: { mode: 'single_destination', destinationIndex: 0 } });
  gate.resolve(true);
  assert.equal((await pending).status, 'needs_calculation');
  assert.equal(run.urls.length, 0);
});
