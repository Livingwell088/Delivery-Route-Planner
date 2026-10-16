import { apiUrl } from './routeApi.js';

/** Only the backend talks to Google; no provider key belongs in this client. */
export async function validateAddress(address, {
  signal, fetchImpl = globalThis.fetch, timeoutMs = 25_000,
} = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetchImpl(`${apiUrl}/addresses/validate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }), signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok) {
      const messages = {
        map_provider_configuration_error: 'Address lookup is unavailable because the server’s Google configuration needs attention.',
        map_provider_rate_limited: 'Address lookup has reached its Google usage limit. Try again later.',
        map_provider_unavailable: 'Google address lookup is temporarily unavailable. Try again.',
      };
      throw new Error(messages[body?.error?.code] ?? `Address lookup failed (${response.status}). Try again.`);
    }
    return body;
  } catch (error) {
    if (timedOut) throw new Error('Address lookup timed out. Your details are saved here; try again.');
    if (signal?.aborted) throw error;
    if (error instanceof SyntaxError) throw new Error('The server returned an unreadable address response. Try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach address lookup. Check your connection and the backend, then retry.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}
