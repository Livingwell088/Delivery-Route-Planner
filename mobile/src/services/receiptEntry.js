import { createDraftReceiptFingerprint, createReceiptFingerprint } from './receiptDuplicate.js';
import { validateReceiptDraft } from './receiptOrderDraft.js';

export const MAX_ACTIVE_ORDERS = 8;

function snapshot(order) {
  return JSON.stringify({ order_id: order.order_id, address: order.address,
    placedAt: order.placedAt, receiptFingerprints: order.receiptFingerprints ?? [] });
}

/** The original is never removed while capture, OCR, review or confirmation runs. */
export function beginReceiptEntry(orders, replacementOrderId = null) {
  if (replacementOrderId !== null) {
    const original = orders.find((order) => order.order_id === replacementOrderId);
    if (!original) throw new Error('This order is no longer in the run. Return to Orders and try again.');
    return { replacementOrderId, originalSnapshot: snapshot(original) };
  }
  if (orders.length >= MAX_ACTIVE_ORDERS) throw new Error('A run can contain up to eight orders. Remove an order or rescan an existing one.');
  return { replacementOrderId: null, originalSnapshot: null };
}

/** Exclude only fingerprints owned exclusively by the order being replaced. */
export function receiptFingerprintsForEntry(orders, fingerprints, replacementOrderId = null) {
  const original = orders.find((order) => order.order_id === replacementOrderId);
  const owned = new Set(original?.receiptFingerprints ?? []);
  const others = orders.filter((order) => order.order_id !== replacementOrderId)
    .flatMap((order) => order.receiptFingerprints ?? []);
  return [...new Set([...fingerprints.filter((value) => !owned.has(value)), ...others])];
}

function checkEntry(orders, fingerprints, entry, order, newFingerprints) {
  if (!entry) throw new Error('Start a new receipt or rescan from Orders.');
  const original = orders.find((item) => item.order_id === entry.replacementOrderId);
  if (entry.replacementOrderId !== null && (!original || snapshot(original) !== entry.originalSnapshot)) {
    throw new Error('The original order changed while reviewing this receipt. Cancel and rescan it again.');
  }
  if (entry.replacementOrderId === null && orders.length >= MAX_ACTIVE_ORDERS) {
    throw new Error('A run can contain up to eight orders. Remove an order or rescan an existing one.');
  }
  const others = orders.filter((item) => item.order_id !== entry.replacementOrderId);
  if (others.some((item) => item.order_id.trim() === order.order_id)) {
    throw new Error(`Order #${order.order_id} is already in the list.`);
  }
  const blocked = receiptFingerprintsForEntry(orders, fingerprints, entry.replacementOrderId);
  if (newFingerprints.some((value) => blocked.includes(value))) {
    throw new Error('This receipt or destination and order time already belongs to another order in the run.');
  }
}

/** Check before provider confirmation; check again against the latest run at commit. */
export function prepareReceiptEntry(orders, fingerprints, entry, draft, scanResult) {
  const normalizedDraft = { ...draft, order_id: draft?.order_id?.trim() ?? '' };
  const message = validateReceiptDraft(normalizedDraft);
  if (message) throw new Error(message);
  if (normalizedDraft.order_id === 'start') throw new Error('Order number "start" is reserved. Enter the printed order number.');
  const receiptFingerprints = normalizedDraft.source === 'receipt-ocr'
    ? [...new Set([createDraftReceiptFingerprint(normalizedDraft), createReceiptFingerprint(scanResult)].filter(Boolean))] : [];
  checkEntry(orders, fingerprints, entry, normalizedDraft, receiptFingerprints);
  return { draft: normalizedDraft, receiptFingerprints };
}

export function commitReceiptEntry(orders, fingerprints, entry, confirmedOrder, receiptFingerprints) {
  checkEntry(orders, fingerprints, entry, confirmedOrder, receiptFingerprints);
  const confirmed = { ...confirmedOrder, receiptFingerprints };
  const nextOrders = entry.replacementOrderId === null ? [...orders, confirmed]
    : orders.map((order) => order.order_id === entry.replacementOrderId ? confirmed : order);
  return { orders: nextOrders, fingerprints: [...new Set([
    ...receiptFingerprintsForEntry(orders, fingerprints, entry.replacementOrderId), ...receiptFingerprints,
  ])] };
}

export function removeReceiptOrder(orders, fingerprints, orderId) {
  return { orders: orders.filter((order) => order.order_id !== orderId),
    fingerprints: receiptFingerprintsForEntry(orders, fingerprints, orderId) };
}

export function receiptEntryRoutePreference(plan, entry, orderId) {
  return entry.replacementOrderId === null ? undefined : {
    sequence: plan.sequence.map((id) => id === entry.replacementOrderId ? orderId : id),
    source: plan.sequenceSource,
  };
}
