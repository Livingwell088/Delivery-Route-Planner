import assert from 'node:assert/strict';
import test from 'node:test';

import { addressReviewError, confirmAddressForOrder, createAddressReviewController,
  emptyAddressReview, reviewedAddressLabel, selectedAddressCandidate, updateDraftAddress } from '../src/services/addressReview.js';

const input = '10 Example St Apt 2, Worcester, MA 01608';
const candidate = (id = 'a', changes = {}) => ({
  candidate_id: id, place_id: `place-${id}`, provider: 'google',
  normalized_address: '10 Example Street, Worcester, MA 01608, USA',
  coordinates: { latitude: 42.26, longitude: -71.8 },
  is_usable: true, requires_review: false, warnings: [], ...changes,
});
const response = (candidates = [candidate()], status = 'needs_confirmation') => ({
  status, candidates, unit: 'Apt 2', warnings: [],
});
function harness(validate) {
  let state;
  const controller = createAddressReviewController({ validate, onChange: (value) => { state = value; } });
  return { controller, get state() { return state; } };
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('clean single Google result is preselected but still needs final driver confirmation', async () => {
  const h = harness(async () => response());
  await h.controller.lookup(input);
  assert.equal(h.state.selectedCandidateId, 'a');
  assert.equal(h.state.status, 'needs_confirmation');
  assert.equal(addressReviewError(h.state, input), null);
});

test('multiple matches require explicit selection and preserve review warnings', async () => {
  const h = harness(async () => response([candidate(), candidate('b', {
    requires_review: true, warnings: ['The returned town differs.'],
  })], 'needs_selection'));
  await h.controller.lookup(input);
  assert.equal(h.state.selectedCandidateId, null);
  assert.match(addressReviewError(h.state, input), /Choose/);
  h.controller.select('b');
  assert.equal(selectedAddressCandidate(h.state, input).place_id, 'place-b');
  assert.deepEqual(selectedAddressCandidate(h.state, input).warnings, ['The returned town differs.']);
});

test('partial or ZIP-conflicting result requires deliberate selection', async () => {
  const h = harness(async () => response([candidate('a', { requires_review: true })]));
  await h.controller.lookup(input);
  assert.equal(h.state.selectedCandidateId, null);
  h.controller.select('a');
  assert.equal(addressReviewError(h.state, input), null);
});

test('street-only hints and invalid addresses cannot be selected or saved', async () => {
  const h = harness(async () => response([candidate('a', { is_usable: false })], 'invalid'));
  await h.controller.lookup(input);
  h.controller.select('a');
  assert.equal(selectedAddressCandidate(h.state, input), null);
  assert.match(addressReviewError(h.state, input), /Correct/);
  assert.throws(() => confirmAddressForOrder({ address: { formatted_address: input } }, h.state));
});

test('address edit clears provider metadata and immediately blocks old selection', async () => {
  const h = harness(async () => response());
  await h.controller.lookup(input);
  const next = updateDraftAddress({ order_id: '1', address: {
    formatted_address: input, coordinates: candidate().coordinates, unit: 'Apt 2',
    validated_location: { validation_reference: 'stale' },
  } }, '12 Example St, Worcester, MA');
  assert.deepEqual(next.address, { formatted_address: '12 Example St, Worcester, MA', coordinates: null });
  assert.equal(selectedAddressCandidate(h.state, next.address.formatted_address), null);
  assert.throws(() => confirmAddressForOrder(next, h.state));
});

test('late success cannot replace newer address selection even if transport ignores abort', async () => {
  const old = deferred();
  const h = harness(async (address) => address === input ? old.promise : response([candidate('b')]));
  const first = h.controller.lookup(input);
  await h.controller.lookup('12 Example St, Worcester, MA');
  old.resolve(response());
  await first;
  assert.equal(h.state.input, '12 Example St, Worcester, MA');
  assert.equal(h.state.selectedCandidateId, 'b');
});

test('late error cannot clear newer successful results', async () => {
  const old = deferred();
  const h = harness(async (address) => address === input ? old.promise : response());
  const first = h.controller.lookup(input);
  await h.controller.lookup('new address');
  old.reject(new Error('late error'));
  await first;
  assert.equal(h.state.status, 'needs_confirmation');
  assert.equal(h.state.error, null);
});

test('cancel aborts the request and suppresses completion after leaving review', async () => {
  const pending = deferred();
  let signal;
  const h = harness(async (_address, options) => { signal = options.signal; return pending.promise; });
  const work = h.controller.lookup(input);
  h.controller.cancel();
  assert.equal(signal.aborted, true);
  pending.resolve(response());
  await work;
  assert.equal(h.state.status, 'checking');
  assert.equal(h.state.selectedCandidateId, null);
});

test('retry recovers without modifying editable order fields', async () => {
  let calls = 0;
  const draft = { order_id: '1', placedAt: '2026-10-16T12:00:00Z', address: { formatted_address: input } };
  const original = structuredClone(draft);
  const h = harness(async () => { if (++calls === 1) throw new Error('Offline'); return response(); });
  await h.controller.lookup(input);
  assert.equal(h.state.status, 'error');
  assert.match(addressReviewError(h.state, input), /Offline/);
  await h.controller.lookup(input);
  assert.equal(addressReviewError(h.state, input), null);
  assert.deepEqual(draft, original);
});

test('final confirmation preserves unit, coordinates, original input and chosen Place ID', async () => {
  const h = harness(async () => response());
  await h.controller.lookup(input);
  const draft = { order_id: '1', receiptReview: { action: 'confirm' }, address: { formatted_address: input } };
  const saved = confirmAddressForOrder(draft, h.state);
  assert.equal(saved.address.raw_address, input);
  assert.equal(saved.address.unit, 'Apt 2');
  assert.deepEqual(saved.address.coordinates, candidate().coordinates);
  assert.equal(saved.addressReview.status, 'confirmed');
  assert.equal(selectedAddressCandidate(saved.addressReview, input).place_id, 'place-a');
  assert.equal(saved.address.validated_location, undefined);
  assert.equal(reviewedAddressLabel(saved), `${candidate().normalized_address} · Apt 2`);
  assert.equal(draft.address.unit, undefined);
});

test('development syntax check cannot be mistaken for Google validation', async () => {
  const h = harness(async () => ({ status: 'unvalidated', is_valid: true, candidates: [] }));
  await h.controller.lookup(input);
  assert.equal(h.state.status, 'error');
  assert.match(h.state.error, /provider configuration/);
});

test('malformed coordinates or duplicate identities cannot enable confirmation', async () => {
  for (const candidates of [[candidate('a', { coordinates: { latitude: 999, longitude: 0 } })], [candidate(), candidate()]]) {
    const h = harness(async () => response(candidates));
    await h.controller.lookup(input);
    assert.equal(h.state.status, 'error');
    assert.equal(h.state.selectedCandidateId, null);
  }
});

test('editing time or order number does not invalidate the same destination', async () => {
  const h = harness(async () => response());
  await h.controller.lookup(input);
  assert.equal(confirmAddressForOrder({ order_id: '2', placedAt: 'changed', address: { formatted_address: input } }, h.state).order_id, '2');
});

test('empty/loading review blocks confirmation', () => {
  assert.match(addressReviewError(emptyAddressReview(input), input), /Wait/);
  assert.match(addressReviewError({ ...emptyAddressReview(input), status: 'checking' }, input), /Checking/);
});
