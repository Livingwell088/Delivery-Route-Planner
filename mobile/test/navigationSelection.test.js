import assert from 'node:assert/strict';
import test from 'node:test';
import { createNavigationSelection, currentNavigationSelection } from '../src/services/navigationSelection.js';

const route = { ordered_stops: [{ order_id: 'B' }, { order_id: 'A' }] };

test('selection belongs only to the exact calculated route; new calculation and restore start at stop one', () => {
  const selection = createNavigationSelection(route, 'single_destination', 1);
  assert.equal(currentNavigationSelection(selection, route), selection);
  for (const next of [null, { ...route }, { ordered_stops: [...route.ordered_stops].reverse() }]) {
    assert.deepEqual(currentNavigationSelection(selection, next), { mode: 'full_route', destinationIndex: 0 });
  }
  assert.deepEqual(currentNavigationSelection(null, route), { mode: 'full_route', destinationIndex: 0 });
});

test('explicit selection covers deliveries and restaurant, with full-route mode resetting the index', () => {
  const original = structuredClone(route);
  for (const index of [0, 1, 2]) assert.equal(createNavigationSelection(route, 'single_destination', index).destinationIndex, index);
  assert.equal(createNavigationSelection(route, 'full_route', 2).destinationIndex, 0);
  assert.deepEqual(route, original);
});

test('invalid destinations or modes cannot create selection', () => {
  for (const index of [-1, 3, NaN, 1.5, '1']) assert.equal(createNavigationSelection(route, 'single_destination', index), null);
  assert.equal(createNavigationSelection(route, 'invalid'), null);
  assert.equal(createNavigationSelection(null, 'single_destination'), null);
  assert.equal(createNavigationSelection({ ordered_stops: [] }, 'single_destination'), null);
});
