import assert from 'node:assert/strict';
import test from 'node:test';
import { createNavigationRoute, createNavigationDestination, supportsAppleMultiStopRoutes } from '../src/services/navigationLinks.js';

const origin = { formatted_address: 'Restaurant & café', coordinates: { latitude: 42.1, longitude: -71.1 } };
const stops = Array.from({ length: 8 }, (_, index) => ({ address: {
  formatted_address: `Building ${index} · Apt #2 & café`, unit: 'Apt #2',
  coordinates: { latitude: 42.2 + index / 100, longitude: -71.2 },
} }));
const ios = { OS: 'ios', Version: '18.4' };
const coord = (address) => `${address.coordinates.latitude},${address.coordinates.longitude}`;

test('one and eight deliveries preserve order and restaurant return for both providers', () => {
  for (const app of ['apple', 'google']) for (const count of [1, 8]) {
    const route = createNavigationRoute(app, stops.slice(0, count), origin, ios);
    const query = new URL(route.url).searchParams;
    assert.equal(route.includesAllStops, true);
    assert.equal(query.get(app === 'apple' ? 'source' : 'origin'), coord(origin));
    assert.equal(query.get('destination'), coord(origin));
    assert.deepEqual(app === 'apple' ? query.getAll('waypoint') : query.get('waypoints').split('|'), stops.slice(0, count).map((stop) => coord(stop.address)));
    assert.ok(!route.url.includes(' '));
    assert.ok(route.url.includes('%2C'));
    assert.equal(query.get('destination-place-id'), null);
  }
});

test('semantic Apple version boundaries and malformed versions choose conservative behavior', () => {
  for (const version of ['18.4', '18.4.1', '18.10', '19', '26.2']) assert.equal(supportsAppleMultiStopRoutes({ OS: 'ios', Version: version }), true);
  for (const version of ['18.3.9', '18', '', '18.4beta', 'garbage', undefined]) assert.equal(supportsAppleMultiStopRoutes({ OS: 'ios', Version: version }), false);
  assert.equal(supportsAppleMultiStopRoutes({ OS: 'android', Version: 35 }), false);
});

test('legacy Apple fallback uses the confirmed building and leaves units untouched', () => {
  const original = structuredClone(stops);
  const link = createNavigationRoute('apple', stops, origin, { OS: 'ios', Version: '18.3' });
  assert.equal(link.includesAllStops, false);
  assert.equal(new URL(link.url).searchParams.get('daddr'), coord(stops[0].address));
  assert.deepEqual(stops, original);
});

test('browser and unknown transports never claim full-route export, including four/eight deliveries', () => {
  for (const transport of ['browser', 'unknown']) for (const count of [1, 4, 8]) {
    const route = createNavigationRoute('google', stops.slice(0, count), origin, ios, { transport });
    assert.equal(route.mode, 'single_destination');
    assert.equal(new URL(route.url).searchParams.get('waypoints'), null);
  }
});

test('every delivery and restaurant can be opened without a fixed origin', () => {
  for (const app of ['google', 'apple']) for (const platform of [ios, { OS: 'ios', Version: '18.3' }]) {
    for (let destinationIndex = 0; destinationIndex <= stops.length; destinationIndex++) {
      const link = createNavigationRoute(app, stops, origin, platform, { mode: 'single_destination', destinationIndex });
      const query = new URL(link.url).searchParams;
      assert.equal(query.get('destination') ?? query.get('daddr'), coord(destinationIndex === stops.length ? origin : stops[destinationIndex].address));
      for (const key of ['origin', 'source', 'saddr', 'waypoint', 'waypoints']) assert.equal(query.get(key), null);
    }
  }
});

test('invalid routes and coordinates cannot produce links or substitute a mock restaurant', () => {
  for (const bad of [null, {}, { formatted_address: ' ' }, ...[NaN, Infinity, 91, '42'].map((latitude) => ({ ...origin, coordinates: { latitude, longitude: 0 } })), { ...origin, coordinates: { latitude: 0, longitude: 181 } }]) {
    assert.equal(createNavigationDestination('google', bad), null);
    assert.equal(createNavigationRoute('google', stops, bad), null);
    assert.equal(createNavigationRoute('apple', [{ address: bad }], origin, ios), null);
  }
  for (const badStops of [null, {}, [], [null], Array(2), [...stops, stops[0]]]) assert.equal(createNavigationRoute('google', badStops, origin), null);
  assert.equal(createNavigationRoute('google', stops), null);
  assert.equal(createNavigationRoute('invalid', stops, origin), null);
  for (const options of [{ destinationIndex: -1 }, { destinationIndex: 9 }, { destinationIndex: 0.5 }, { mode: 'invalid' }, { transport: 'invalid' }]) assert.equal(createNavigationRoute('google', stops, origin, ios, options), null);
});

test('coordinate boundaries are valid and arbitrary labels never enter provider queries', () => {
  const address = { formatted_address: '\ud800 & # ? café', coordinates: { latitude: -90, longitude: 180 } };
  assert.equal(new URL(createNavigationDestination('google', address).url).searchParams.get('destination'), '-90,180');
  assert.equal(new URL(createNavigationDestination('apple', address, ios).url).searchParams.get('destination'), '-90,180');
});
