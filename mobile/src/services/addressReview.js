/** Client review state is bound to the exact editable address, not a trusted backend reference. */
export function emptyAddressReview(input = '') {
  return { input, status: 'idle', candidates: [], selectedCandidateId: null, unit: null, warnings: [], error: null };
}

function usable(candidate) {
  const point = candidate?.coordinates;
  return candidate?.provider === 'google' && candidate.is_usable === true
    && typeof candidate.requires_review === 'boolean'
    && typeof candidate.candidate_id === 'string' && candidate.candidate_id.trim()
    && typeof candidate.place_id === 'string' && candidate.place_id.trim()
    && typeof candidate.normalized_address === 'string' && candidate.normalized_address.trim()
    && Number.isFinite(point?.latitude) && Math.abs(point.latitude) <= 90
    && Number.isFinite(point?.longitude) && Math.abs(point.longitude) <= 180;
}

export function selectedAddressCandidate(review, input) {
  if (review?.input !== input || !['needs_confirmation', 'needs_selection', 'confirmed'].includes(review.status)
    || !Array.isArray(review.candidates)) return null;
  return review.candidates.find((candidate) => candidate.candidate_id === review.selectedCandidateId && usable(candidate)) ?? null;
}

export function addressReviewError(review, input) {
  if (review?.input !== input || !review || review.status === 'idle') return 'Wait for the delivery address to be checked.';
  if (review.status === 'checking') return 'Checking the delivery address…';
  if (review.status === 'error') return review.error || 'Address lookup failed. Try again.';
  if (review.status === 'invalid') return 'Correct the delivery address before adding this order.';
  if (!selectedAddressCandidate(review, input)) return 'Choose the destination that matches the receipt.';
  return null;
}

export function updateDraftAddress(draft, value) {
  // An edit must remove coordinates and all earlier provider identity/validation.
  return { ...draft, address: { formatted_address: value, coordinates: null } };
}

export function reviewedAddressLabel(order) {
  if (order.address.validated_location) return order.address.formatted_address;
  const candidate = selectedAddressCandidate(order.addressReview, order.address.formatted_address);
  if (!candidate) return order.address.formatted_address;
  return [candidate.normalized_address, order.address.unit].filter(Boolean).join(' · ');
}

export function confirmAddressForOrder(draft, review, address) {
  const candidate = selectedAddressCandidate(review, draft.address.formatted_address);
  const location = address?.validated_location;
  if (!candidate || address?.raw_address !== draft.address.formatted_address
    || location?.provider !== 'google' || location.place_id !== candidate.place_id
    || !location.validation_reference || !(Date.parse(location.expires_at) > Date.now())
    || address.unit !== review.unit
    || address.coordinates?.latitude !== candidate.coordinates.latitude
    || address.coordinates?.longitude !== candidate.coordinates.longitude) {
    throw new Error('The server did not confirm the selected destination. Retry the address lookup.');
  }
  return { ...draft, address };
}

/** Generation checks protect against transports that finish even after abort. */
export function createAddressReviewController({ validate, onChange }) {
  let generation = 0;
  let controller = null;
  let current = emptyAddressReview();
  const publish = (next) => { current = next; onChange(next); };
  const cancel = () => { generation += 1; controller?.abort(); controller = null; };
  return {
    cancel,
    async lookup(input) {
      cancel();
      const request = generation;
      controller = new AbortController();
      publish({ ...emptyAddressReview(input), status: 'checking' });
      try {
        const response = await validate(input, { signal: controller.signal });
        if (request !== generation) return;
        if (!['invalid', 'needs_selection', 'needs_confirmation'].includes(response?.status)
          || !Array.isArray(response.candidates)) {
          throw new Error('Google address validation is unavailable. Check the backend provider configuration.');
        }
        const candidates = response.candidates.filter((candidate) => candidate && typeof candidate === 'object')
          .map((candidate) => ({ ...candidate,
            warnings: Array.isArray(candidate.warnings)
              ? candidate.warnings.filter((warning) => typeof warning === 'string') : [],
          }));
        if (candidates.length !== response.candidates.length
          || candidates.some((candidate) => typeof candidate.normalized_address !== 'string'
            || typeof candidate.candidate_id !== 'string'
            || (candidate.is_usable === true && !usable(candidate)))
          || new Set(candidates.map((candidate) => candidate.candidate_id)).size !== candidates.length) {
          throw new Error('The server returned an incomplete address candidate. Retry the lookup.');
        }
        const eligible = candidates.filter(usable);
        const autoSelect = response.status === 'needs_confirmation' && eligible.length === 1 && !eligible[0].requires_review;
        publish({
          ...emptyAddressReview(input), status: response.status, candidates,
          lookupReference: response.lookup_reference ?? null,
          selectedCandidateId: autoSelect ? eligible[0].candidate_id : null,
          unit: typeof response.unit === 'string' ? response.unit : null,
          warnings: Array.isArray(response.warnings) ? response.warnings.filter((item) => typeof item === 'string') : [],
        });
      } catch (error) {
        if (request !== generation) return;
        publish({ ...emptyAddressReview(input), status: 'error',
          error: error instanceof Error ? error.message : 'Address lookup failed. Try again.' });
      }
    },
    select(candidateId) {
      if (!['needs_selection', 'needs_confirmation'].includes(current.status)) return;
      if (!current.candidates.some((candidate) => candidate.candidate_id === candidateId && usable(candidate))) return;
      publish({ ...current, selectedCandidateId: candidateId });
    },
  };
}
