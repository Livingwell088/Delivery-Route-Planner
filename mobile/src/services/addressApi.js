import { apiUrl } from './routeApi.js';

/** Only the backend talks to Google; no provider key belongs in this client. */
export async function validateAddress(address, {
  signal, fetchImpl = globalThis.fetch, timeoutMs = 25_000,
  endpoint = 'validate', payload = { address },
} = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await fetchImpl(`${apiUrl}/addresses/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: controller.signal,
    });
    const body = await response.json();
    if (!response.ok) {
      const messages = {
        map_provider_configuration_error: 'Address lookup is unavailable because the server’s Google configuration needs attention.',
        map_provider_rate_limited: 'Address lookup has reached its Google usage limit. Try again later.',
        map_provider_unavailable: 'Google address lookup is temporarily unavailable. Try again.',
        location_review_required: 'This address lookup expired or changed. Retry the lookup and confirm again.',
        map_usage_limit_reached: 'This app has reached its Google usage allowance. Your details are saved; contact the administrator before retrying.',
        map_usage_unavailable: 'Google usage tracking is unavailable. Your details are saved; ask the administrator to check the backend.',
      };
      const error = new Error(messages[body?.error?.code] ?? `Address lookup failed (${response.status}). Try again.`);
      error.code = body?.error?.code;
      throw error;
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

export function confirmAddress(address, lookupReference, candidateId, options = {}) {
  return validateAddress(address, { ...options, endpoint: 'confirm', payload: {
    address, lookup_reference: lookupReference, candidate_id: candidateId,
  } });
}

/** Refresh only an unchanged, unambiguous destination; changed results need review. */
export async function ensureConfirmedAddress(address, { validate = validateAddress, confirm = confirmAddress, now = Date.now(), force = false, signal } = {}) {
  const location = address.validated_location;
  if (!force && location?.validation_reference && Date.parse(location.expires_at) > now) return address;
  const input = address.raw_address || address.formatted_address;
  const result = await validate(input, { signal });
  if (signal?.aborted) throw new Error('Address refresh canceled.');
  const candidates = result.candidates?.filter((c) => c.is_usable) ?? [];
  const candidate = candidates[0];
  if (candidates.length !== 1 || candidate.requires_review || !result.lookup_reference
    || (location && candidate.place_id !== location.place_id)
    || (address.unit ?? null) !== (result.unit ?? null)) {
    const error = new Error('The destination needs review. Use the order’s ••• menu to rescan and confirm its location.');
    error.code = 'order_location_review_required';
    throw error;
  }
  return confirm(input, result.lookup_reference, candidate.candidate_id, { signal });
}
