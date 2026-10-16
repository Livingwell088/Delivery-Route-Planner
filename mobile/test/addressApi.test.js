import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAddress } from '../src/services/addressApi.js';

test('address lookup sends only address text to the backend', async () => {
  const result = await validateAddress('10 Example St', { fetchImpl: async (url, options) => {
    assert.match(url, /\/addresses\/validate$/);
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { address: '10 Example St' });
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
    return { ok: true, json: async () => ({ status: 'invalid', candidates: [] }) };
  } });
  assert.equal(result.status, 'invalid');
});

test('quota and configuration errors give actionable messages', async () => {
  for (const [code, expected] of [['map_provider_rate_limited', /usage limit/], ['map_provider_configuration_error', /configuration/]]) {
    await assert.rejects(validateAddress('10 Example St', { fetchImpl: async () => ({
      ok: false, status: 503, json: async () => ({ error: { code } }),
    }) }), expected);
  }
});

test('connection failure and unreadable response block save with retry guidance', async () => {
  await assert.rejects(validateAddress('address', { fetchImpl: async () => { throw new TypeError('Network failed'); } }), /Check your connection/);
  await assert.rejects(validateAddress('address', { fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError(); } }) }), /unreadable/);
});

function abortableFetch(_url, { signal }) {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

test('deadline aborts a stalled lookup', async () => {
  await assert.rejects(validateAddress('address', { fetchImpl: abortableFetch, timeoutMs: 5 }), /timed out/);
});

test('leaving the screen propagates cancellation', async () => {
  const controller = new AbortController();
  const work = validateAddress('address', { signal: controller.signal, fetchImpl: abortableFetch });
  controller.abort();
  await assert.rejects(work, { name: 'AbortError' });
});
