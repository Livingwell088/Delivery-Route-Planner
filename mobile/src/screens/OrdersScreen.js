import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { reviewedAddressLabel } from '../services/addressReview';
import { AppButton } from '../components/AppButton';
import { ErrorMessage } from '../components/ErrorMessage';
import { OrderMap } from '../components/OrderMap';
import { AddressReview } from '../components/AddressReview';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';
import { MAX_ACTIVE_ORDERS } from '../services/receiptEntry';

export function OrdersScreen({ orders, onAdd, onRemove, onRescan, onOptimize, loading, error, originReview, originReady = true, restaurant, routeStatus, onReviewRoute, receiptNotice }) {
  const atCapacity = orders.length >= MAX_ACTIVE_ORDERS;
  const orderSummary = orders.length
    ? `${orders.length} confirmed order${orders.length === 1 ? '' : 's'} ready.`
    : 'No orders yet. Scan a receipt to begin.';

  return (
    <ScrollView contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.eyebrow}>ACTIVE RUN</Text>
      <Text style={commonStyles.title}>Scanned orders</Text>
      <Text style={commonStyles.subtitle}>{orderSummary}</Text>
      {receiptNotice && <Text accessibilityLiveRegion="polite" style={commonStyles.muted}>{receiptNotice}</Text>}
      <OrderMap orders={orders} restaurant={restaurant} />
      {orders.map((order, index) => (
        <View style={styles.orderCard} key={order.order_id}>
          <View style={styles.number}>
            <Text style={styles.numberText}>{index + 1}</Text>
          </View>
          <View style={commonStyles.orderDetails}>
            <Text style={commonStyles.cardTitle}>Order #{order.order_id}</Text>
            <Text style={commonStyles.muted}>{reviewedAddressLabel(order)}</Text>
          </View>
          <View style={styles.orderActions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Rescan order ${order.order_id}`}
            style={styles.orderAction} onPress={() => onRescan(order.order_id)}>
            <Text style={styles.rescan}>Rescan</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove order ${order.order_id}`}
            style={styles.orderAction} onPress={() => onRemove(order.order_id)}>
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
          </View>
        </View>
      ))}
      {error && <ErrorMessage message={error} />}
      <AppButton label={orders.length ? 'Scan next receipt' : 'Scan receipt'} onPress={onAdd} secondary disabled={atCapacity || loading} />
      {atCapacity && <Text style={commonStyles.muted}>Eight-order limit reached. You can still rescan, remove, or optimize these orders.</Text>}
      {routeStatus === 'needs_calculation' && <Text style={commonStyles.muted}>
        Calculate the route for these orders before opening navigation.
      </Text>}
      {routeStatus === 'ready' && <AppButton label="Review calculated route" onPress={onReviewRoute} secondary />}
      {originReview && <View style={{ gap: 10 }}>
        <Text style={commonStyles.cardTitle}>Restaurant starting location</Text>
        <Text style={commonStyles.muted}>Check the starting location below. Submitting the route confirms this restaurant location.</Text>
        <AddressReview review={originReview.review} onSelect={originReview.selectCandidate} onRetry={originReview.retry} />
      </View>}
      <AppButton
        label="Submit and optimize route"
        onPress={onOptimize}
        disabled={!orders.length || loading || !originReady}
      />
      {loading && <ActivityIndicator style={styles.loader} color={colors.deepGold} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  number: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    color: colors.black,
    fontWeight: '800',
  },
  remove: {
    color: colors.errorText,
    fontWeight: '700',
    fontSize: 13,
  },
  orderActions: { alignItems: 'stretch' },
  orderAction: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  rescan: { color: colors.deepGold, fontWeight: '700', fontSize: 13 },
  loader: {
    marginTop: 4,
  },
});
