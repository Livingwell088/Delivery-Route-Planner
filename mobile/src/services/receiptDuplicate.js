function selectedCandidate(candidates, selectedId) {
  return candidates.find(({ id }) => id === selectedId) ?? null;
}

function normalizeAddressPart(value) {
  return value
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Creates a stable identity from the two fields that define a supported receipt. */
export function createReceiptFingerprint(result) {
  if (!result) return null;
  const address = selectedCandidate(result.addressCandidates, result.selectedAddressCandidateId);
  const timestamp = selectedCandidate(result.timestampCandidates, result.selectedTimestampCandidateId);
  if (!address || !timestamp?.timestamp) return null;

  return createDraftReceiptFingerprint({ address: { formatted_address:
    `${address.streetAddress}, ${address.city}, ${address.state} ${address.postalCode}` },
    placedAt: timestamp.timestamp });
}

export function createDraftReceiptFingerprint(draft) {
  if (!draft?.address?.formatted_address?.trim() || !draft.placedAt
    || Number.isNaN(new Date(draft.placedAt).getTime())) return null;
  return `${normalizeAddressPart(draft.address.formatted_address)}|${new Date(draft.placedAt).toISOString().slice(0, 16)}`;
}

export function isDuplicateReceipt(result, acceptedFingerprints = []) {
  const fingerprint = createReceiptFingerprint(result);
  return fingerprint != null && acceptedFingerprints.includes(fingerprint);
}
