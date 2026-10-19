import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_SESSION_KEY, createSessionWriter, decodeActiveSession, encodeActiveSession } from '../src/services/activeSession.js';
import { confirmAddress, ensureConfirmedAddress } from '../src/services/addressApi.js';

const now = Date.parse('2026-10-16T16:00:00Z');
const address = { formatted_address: '10 Example St, Worcester, MA', raw_address: '10 Example St, Worcester, MA', unit: null,
  coordinates: { latitude: 42, longitude: -71 }, validated_location: {
    provider: 'google', place_id: 'a', validation_reference: 'signed', expires_at: new Date(now + 3_600_000).toISOString(),
  } };
const order = { order_id: '1', address, placedAt: new Date(now).toISOString(),
  receiptFingerprints: ['fp'], image: 'private-receipt', receiptReview: { raw: 'private OCR' } };

test('restore only active order data and duplicate protection, excluding receipt images and OCR', () => {
  const text = encodeActiveSession([order], ['fp'], now);
  const restored = decodeActiveSession(text, now);
  assert.equal(restored.orders[0].address.validated_location.place_id, 'a');
  assert.deepEqual(restored.fingerprints, ['fp']);
  assert.deepEqual(restored.orders[0].receiptFingerprints, ['fp']);
  assert.equal(text.includes('private'), false);
});

test('corrupt, unknown version, expired, duplicate and unconfirmed sessions are discarded', () => {
  const text = encodeActiveSession([order], [], now);
  for (const value of ['bad JSON', text.replace('"version":1', '"version":0'),
    encodeActiveSession([order, order], [], now),
    encodeActiveSession([{ ...order, address: { formatted_address: 'Unconfirmed' } }], [], now)]) {
    assert.equal(decodeActiveSession(value, now).discarded, true);
  }
  assert.equal(decodeActiveSession(text, now + 3_600_000).discarded, true);
  assert.equal(decodeActiveSession(text, now - 1).discarded, true);
  assert.deepEqual(decodeActiveSession(null, now), { orders: [], fingerprints: [] });
});

test('ordered storage writes preserve removal and recover after a failed write', async () => {
  const writes = [];
  const save = createSessionWriter({ async setItem(key, text) {
    assert.equal(key, ACTIVE_SESSION_KEY);
    writes.push(text);
    if (text === 'failed') throw new Error('Storage unavailable');
  } });
  await assert.rejects(save('failed'));
  await Promise.all([save('added'), save('removed')]);
  assert.deepEqual(writes, ['failed', 'added', 'removed']);
});

test('restore a sequence preference without restoring route estimates or losing legacy sessions', () => {
  const orders = [order, { ...order, order_id: '2' }];
  const text = encodeActiveSession(orders, ['fp'], now, {
    sequence: ['2', '1'], source: 'manual', route: { private: 'old estimate' }, departureAt: 'old',
  });
  const restored = decodeActiveSession(text, now);
  assert.deepEqual(restored.routePreference, { sequence: ['2', '1'], source: 'manual' });
  assert.equal(text.includes('old estimate'), false);
  assert.equal(text.includes('departureAt'), false);
  const legacy = decodeActiveSession(encodeActiveSession(orders, ['fp'], now), now);
  assert.equal(legacy.orders.length, 2);
  assert.equal(legacy.routePreference, undefined);
  for (const sequence of [['1', '1'], ['1'], ['1', 'unknown']]) {
    const corrupted = JSON.stringify({ ...JSON.parse(text), routePreference: { sequence, source: 'manual' } });
    const recovered = decodeActiveSession(corrupted, now);
    assert.equal(recovered.orders.length, 2);
    assert.equal(recovered.routePreference, undefined);
  }
});

test('confirmation submits only address, selected candidate and lookup reference to backend', async () => {
  const result = await confirmAddress('raw', 'lookup', 'candidate', { fetchImpl: async (url, request) => {
    assert.ok(url.endsWith('/addresses/confirm'));
    assert.deepEqual(JSON.parse(request.body), { address: 'raw', lookup_reference: 'lookup', candidate_id: 'candidate' });
    return { ok: true, json: async () => address };
  } });
  assert.equal(result, address);
});

test('valid confirmations avoid more geocoding; expired unchanged destinations refresh', async () => {
  const candidate = { candidate_id: 'candidate', place_id: 'a', is_usable: true, requires_review: false };
  let calls = 0;
  const options = { now, validate: async (raw) => {
    assert.equal(raw, address.raw_address);
    calls++;
    return { candidates: [candidate], lookup_reference: 'lookup', unit: null };
  }, confirm: async (raw, reference, id) => {
    assert.equal(reference, 'lookup'); assert.equal(id, 'candidate'); return address;
  } };
  assert.equal(await ensureConfirmedAddress(address, options), address);
  assert.equal(calls, 0);
  assert.equal(await ensureConfirmedAddress(address, { ...options, force: true }), address);
  assert.equal(calls, 1);
  await ensureConfirmedAddress(address, { ...options, now: now + 3_600_000 });
  assert.equal(calls, 2);
});

test('refresh never silently substitutes a different, ambiguous or review-required location', async () => {
  const clean = { candidate_id: 'candidate', place_id: 'a', is_usable: true, requires_review: false };
  for (const response of [
    { candidates: [{ ...clean, place_id: 'changed' }], unit: null },
    { candidates: [{ ...clean, requires_review: true }], unit: null },
    { candidates: [clean, clean], unit: null }, { candidates: [clean], unit: 'Apt 2' },
    { candidates: [], unit: null },
  ]) {
    await assert.rejects(ensureConfirmedAddress(address, { force: true,
      validate: async () => ({ lookup_reference: 'lookup', ...response }),
      confirm: async () => assert.fail('Must not confirm'),
    }), /needs review/);
  }
});

test('canceling address refresh forwards the signal and prevents confirmation even if lookup ignores abort', async () => {
  const controller = new AbortController();
  await assert.rejects(ensureConfirmedAddress(address, {
    force: true, signal: controller.signal,
    validate: async (raw, { signal }) => {
      assert.equal(signal, controller.signal);
      controller.abort();
      return { candidates: [{ is_usable: true, requires_review: false, place_id: 'a' }], lookup_reference: 'lookup' };
    },
    confirm: () => assert.fail('Canceled lookup must never confirm'),
  }), /canceled/);
});
