const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

const RECEIPTS = [
  { order_id: '108', address: '455 Main St, Worcester, MA', latitude: 42.2626, longitude: -71.8023, age: 32 },
  { order_id: '214', address: '1 Kelley Sq, Worcester, MA', latitude: 42.2522, longitude: -71.8013, age: 18 },
  { order_id: '327', address: '100 Grove St, Worcester, MA', latitude: 42.2744, longitude: -71.8004, age: 42 },
  { order_id: '451', address: '50 Foster St, Worcester, MA', latitude: 42.2619, longitude: -71.7955, age: 9 },
];

export function mockReceipt(index) {
  const receipt = RECEIPTS[index % RECEIPTS.length];
  return {
    order_id: receipt.order_id,
    address: {
      formatted_address: receipt.address,
      coordinates: { latitude: receipt.latitude, longitude: receipt.longitude },
    },
    placedAt: minutesAgo(receipt.age),
  };
}

export const DEFAULT_RESTAURANT = {
  formatted_address: '217A Chandler St, Worcester, MA 01609',
  coordinates: { latitude: 42.2574, longitude: -71.8216 },
};
