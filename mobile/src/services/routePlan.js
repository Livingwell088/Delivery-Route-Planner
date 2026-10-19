/** Route lifecycle only. Provider calculation and fixed-sequence evaluation live elsewhere. */
export function createRoutePlan() {
  return { status: 'empty', revision: 0, requestId: 0, inputKey: null,
    sequence: [], sequenceSource: 'optimized', route: null, departureAt: null,
    calculatedAt: null, requestMode: null, error: null };
}

function inputKey(orders, restaurant) {
  return JSON.stringify({ restaurant, orders: orders.map(({ order_id, address, placedAt }) => ({ order_id, address, placedAt })) });
}

export function validSequence(sequence, orders) {
  return Array.isArray(sequence) && sequence.length === orders.length
    && new Set(sequence).size === sequence.length
    && sequence.every((id) => orders.some((order) => order.order_id === id));
}

export function changeRouteInputs(plan, orders, restaurant, preference) {
  const key = inputKey(orders, restaurant);
  if (key === plan.inputKey && !preference) return plan;
  const ids = orders.map((order) => order.order_id);
  const previous = preference?.sequence ?? plan.sequence;
  const sequence = [...previous.filter((id) => ids.includes(id)), ...ids.filter((id) => !previous.includes(id))];
  return { ...plan, status: orders.length ? 'needs_calculation' : 'empty',
    revision: plan.revision + 1, inputKey: key, sequence,
    sequenceSource: preference?.source === 'manual' ? 'manual' : preference ? 'optimized' : plan.sequenceSource,
    route: null, departureAt: null, calculatedAt: null, error: null };
}

export function changeRouteSequence(plan, sequence, orders) {
  if (!validSequence(sequence, orders)) throw new Error('The sequence must contain every current order exactly once.');
  return { ...plan, sequence: [...sequence], sequenceSource: 'manual',
    status: sequence.length ? 'needs_calculation' : 'empty', revision: plan.revision + 1,
    route: null, departureAt: null, calculatedAt: null, error: null };
}

export function beginRouteRequest(plan, mode = 'optimize') {
  if (!plan.sequence.length) throw new Error('Add an order before calculating a route.');
  if (!['optimize', 'evaluate'].includes(mode)) throw new Error('Unknown route calculation mode.');
  return { ...plan, status: 'calculating', requestId: plan.requestId + 1,
    route: null, departureAt: null, calculatedAt: null, requestMode: mode, error: null };
}

export function isCurrentRouteRequest(plan, ticket) {
  return plan.status === 'calculating' && plan.requestId === ticket.requestId && plan.revision === ticket.revision;
}

/** Adopt confirmations obtained by this request, never edits from another revision. */
export function prepareRouteRequest(plan, ticket, orders, restaurant, departureAt) {
  if (!isCurrentRouteRequest(plan, ticket)) return plan;
  if (!Number.isFinite(Date.parse(departureAt))) throw new Error('Invalid route departure time.');
  return { ...plan, inputKey: inputKey(orders, restaurant), departureAt };
}

export function completeRouteRequest(plan, ticket, route, calculatedAt = new Date().toISOString()) {
  if (!isCurrentRouteRequest(plan, ticket)) return plan;
  const sequence = route.ordered_stops.map((stop) => stop.order_id);
  if (!plan.departureAt || sequence.length !== plan.sequence.length
    || new Set(sequence).size !== sequence.length || sequence.some((id) => !plan.sequence.includes(id))
    || (plan.requestMode === 'evaluate' && sequence.some((id, index) => id !== plan.sequence[index]))) {
    throw new Error('The calculated route does not match the requested stops.');
  }
  return { ...plan, status: 'ready', route, calculatedAt,
    sequence, sequenceSource: plan.requestMode === 'optimize' ? 'optimized' : plan.sequenceSource, error: null };
}

export function failRouteRequest(plan, ticket, message) {
  if (!isCurrentRouteRequest(plan, ticket)) return plan;
  return { ...plan, status: 'failed', route: null, departureAt: null, error: message };
}

export function cancelRouteRequest(plan) {
  if (plan.status !== 'calculating') return plan;
  return { ...plan, status: 'needs_calculation', requestId: plan.requestId + 1,
    route: null, departureAt: null, error: null };
}

export function canNavigateRoute(plan, orders, restaurant, now = Date.now()) {
  return plan.status === 'ready' && Boolean(plan.route)
    && plan.inputKey === inputKey(orders, restaurant)
    && validSequence(plan.route.ordered_stops.map((stop) => stop.order_id), orders)
    && [restaurant, ...orders.map((order) => order.address)].every((address) => {
      const location = address?.validated_location;
      return location?.validation_reference && Date.parse(location.expires_at) > now;
    });
}
