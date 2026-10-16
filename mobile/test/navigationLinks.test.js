import assert from 'node:assert/strict';
import test from 'node:test';
import { createNavigationRoute } from '../src/services/navigationLinks.js';

const origin = { formatted_address: 'Confirmed restaurant', coordinates: { latitude: 42.1, longitude: -71.1 } };
const stops = [
  { address: { formatted_address: 'First building · Apt 2', coordinates: { latitude: 42.2, longitude: -71.2 } } },
  { address: { formatted_address: 'Second building · Suite 3', coordinates: { latitude: 42.3, longitude: -71.3 } } },
];

test('Google export preserves stop order and uses the confirmed restaurant both ways', () => {
  const route = createNavigationRoute('google', stops, origin);
  const url = new URL(route.url);
  assert.equal(route.includesAllStops, true);
  assert.equal(url.searchParams.get('origin'), '42.1,-71.1');
  assert.equal(url.searchParams.get('destination'), '42.1,-71.1');
  assert.equal(url.searchParams.get('waypoints'), '42.2,-71.2|42.3,-71.3');
});

test('Apple multi-stop export retains units, order and confirmed restaurant', () => {
  const route = createNavigationRoute('apple', stops, origin, { OS: 'ios', Version: '18.4' });
  assert.equal(route.includesAllStops, true);
  const url = new URL(route.url);
  assert.equal(url.searchParams.get('source'), origin.formatted_address);
  assert.equal(url.searchParams.get('destination'), origin.formatted_address);
  assert.deepEqual(url.searchParams.getAll('waypoint'), stops.map((stop) => stop.address.formatted_address));
});

test('older Apple devices and Android Apple preference export first stop with fallback flag', () => {
  for (const platform of [{ OS: 'ios', Version: '18.3' }, { OS: 'android', Version: 35 }]) {
    const route = createNavigationRoute('apple', stops, origin, platform);
    assert.equal(route.includesAllStops, false);
    assert.equal(new URL(route.url).searchParams.get('daddr'), stops[0].address.formatted_address);
  }
});

test('empty route never generates an external navigation link', () => {
  assert.equal(createNavigationRoute('google', [], origin), null);
  assert.equal(createNavigationRoute('apple', [], origin), null);
});
