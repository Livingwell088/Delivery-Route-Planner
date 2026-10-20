import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { reviewedAddressLabel } from '../services/addressReview';
import { AppButton } from '../components/AppButton';
import { ErrorMessage } from '../components/ErrorMessage';
import { AddressReview } from '../components/AddressReview';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';
import { MAX_ACTIVE_ORDERS } from '../services/receiptEntry';

export function OrdersScreen({ orders, onAdd, onRemove, onRescan, onOptimize, onRecalculate, loading, error, originReview, originReady = true, routeStatus, onReviewRoute, receiptNotice, preserveSequence }) {
  const atCapacity = orders.length >= MAX_ACTIVE_ORDERS;
  const orderSummary = orders.length
    ? `${orders.length} confirmed order${orders.length === 1 ? '' : 's'} ready.`
    : 'No orders yet. Scan a receipt to begin.';

  return (
    <ScrollView contentContainerStyle={commonStyles.content}>
      <Text style={commonStyles.title}>Orders</Text>
      <Text style={commonStyles.subtitle}>{orderSummary}</Text>
      {receiptNotice && <Text accessibilityLiveRegion="polite" style={commonStyles.muted}>{receiptNotice}</Text>}
      {orders.map((order, index) => (
        <View style={styles.orderCard} key={order.order_id}>
          <View style={styles.number}>
            <Text style={styles.numberText}>{index + 1}</Text>
          </View>
          <View style={commonStyles.orderDetails}>
            <Text style={commonStyles.cardTitle}>Order #{order.order_id}</Text>
            <Text style={commonStyles.muted}>{reviewedAddressLabel(order)}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Options for order ${order.order_id}`}
            style={styles.orderAction} onPress={() => Alert.alert(`Order #${order.order_id}`, 'Choose an action.', [
              { text: 'Rescan', onPress: () => onRescan(order.order_id) },
              { text: 'Remove', style: 'destructive', onPress: () => onRemove(order.order_id) },
              { text: 'Cancel', style: 'cancel' },
            ])}>
            <Text style={styles.rescan}>•••</Text>
          </Pressable>
        </View>
      ))}
      {error && <ErrorMessage message={error} />}
      <AppButton label={orders.length ? 'Scan next receipt' : 'Scan receipt'} onPress={onAdd} secondary disabled={atCapacity || loading} />
      {atCapacity && <Text style={commonStyles.muted}>Eight-order limit reached. Use an order's ••• menu to rescan or remove it.</Text>}
      {originReview && <View style={{ gap: 10 }}>
        <Text style={commonStyles.cardTitle}>Restaurant starting location</Text>
        <AddressReview review={originReview.review} onSelect={originReview.selectCandidate} onRetry={originReview.retry} />
      </View>}
      <AppButton
        label={loading ? 'Calculating route…' : routeStatus === 'ready' ? 'View route' : preserveSequence ? 'Update route' : 'Optimize route'}
        onPress={routeStatus === 'ready' ? onReviewRoute : preserveSequence ? onRecalculate : onOptimize}
        disabled={!orders.length || loading || (routeStatus !== 'ready' && !originReady)}
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
  orderAction: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  rescan: { color: colors.deepGold, fontWeight: '700', fontSize: 18 },
  loader: {
    marginTop: 4,
  },
});
