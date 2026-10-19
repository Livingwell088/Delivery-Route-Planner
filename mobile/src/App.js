import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, SafeAreaView, StyleSheet, View } from 'react-native';

import { Header } from './components/Header';
import { AppButton } from './components/AppButton';
import { NAVIGATION_PREFERENCE_KEY } from './constants/storage';
import { DEFAULT_RESTAURANT, mockReceipt } from './data/mockReceipts';
import { useAddressReview } from './hooks/useAddressReview';
import { ConfirmOrderScreen } from './screens/ConfirmOrderScreen';
import { HomeScreen } from './screens/HomeScreen';
import { OrdersScreen } from './screens/OrdersScreen';
import { RouteScreen } from './screens/RouteScreen';
import { ReceiptScannerScreen } from './screens/ReceiptScannerScreen';
import { ReceiptRecognitionScreen } from './screens/ReceiptRecognitionScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { createNavigationRoute } from './services/navigation';
import { createOrderDraftFromReceipt, createManualReceiptDraft } from './services/receiptOrderDraft';
import { MAX_ACTIVE_ORDERS, beginReceiptEntry, prepareReceiptEntry, commitReceiptEntry,
  receiptFingerprintsForEntry, removeReceiptOrder, receiptEntryRoutePreference } from './services/receiptEntry';
import { optimizeRoute } from './services/routeApi';
import { addressReviewError, selectedAddressCandidate, confirmAddressForOrder } from './services/addressReview';
import { confirmAddress, ensureConfirmedAddress } from './services/addressApi';
import { ACTIVE_SESSION_KEY, createSessionWriter, decodeActiveSession, encodeActiveSession } from './services/activeSession';
import { colors } from './theme/colors';
import { createRoutePlan, changeRouteInputs, beginRouteRequest, isCurrentRouteRequest,
  prepareRouteRequest, completeRouteRequest, failRouteRequest, cancelRouteRequest, canNavigateRoute } from './services/routePlan';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [orders, setOrdersState] = useState([]);
  const [draft, setDraft] = useState(null);
  const [routePlan, setRoutePlan] = useState(createRoutePlan);
  const planRef = useRef(routePlan);
  const ordersRef = useRef([]);
  const restaurantRef = useRef(null);
  const routeAbort = useRef(null);
  const route = routePlan.route;
  const updatePlan = (next) => { planRef.current = next; setRoutePlan(next); };
  const setOrders = (value, preference) => {
    const next = typeof value === 'function' ? value(ordersRef.current) : value;
    ordersRef.current = next;
    updatePlan(changeRouteInputs(planRef.current, next, restaurantRef.current, preference));
    setOrdersState(next);
  };
  const [navigationApp, setNavigationApp] = useState('google');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [capturedReceipt, setCapturedReceipt] = useState(null);
  const [receiptScanResult, setReceiptScanResult] = useState(null);
  const [acceptedReceiptFingerprints, setAcceptedReceiptFingerprints] = useState([]);
  const fingerprintsRef = useRef([]);
  const [receiptEntry, setReceiptEntryState] = useState(null);
  const entryRef = useRef(null);
  const setReceiptEntry = (entry) => { entryRef.current = entry; setReceiptEntryState(entry); };
  const setFingerprints = (values) => { fingerprintsRef.current = values; setAcceptedReceiptFingerprints(values); };
  const [receiptNotice, setReceiptNotice] = useState(null);
  const mockIndex = useRef(0);
  const busy = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [restaurant, setRestaurantState] = useState(null);
  const setRestaurant = (value) => {
    restaurantRef.current = value;
    updatePlan(changeRouteInputs(planRef.current, ordersRef.current, value));
    setRestaurantState(value);
  };
  const [revalidateAll, setRevalidateAll] = useState(false);
  const writeSession = useRef(createSessionWriter(AsyncStorage));
  const needsRestaurant = !restaurant || Date.parse(restaurant.validated_location.expires_at) <= Date.now();
  const originReview = useAddressReview(DEFAULT_RESTAURANT.formatted_address,
    hydrated && screen === 'orders' && orders.length > 0 && needsRestaurant);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(ACTIVE_SESSION_KEY).then((text) => {
      if (!active) return;
      const restored = decodeActiveSession(text);
      setOrders(restored.orders, restored.routePreference);
      setFingerprints(restored.fingerprints);
      if (restored.orders.length) setScreen('orders');
      if (restored.discarded) Alert.alert('Previous run cleared', 'The saved delivery run expired or could not be restored. Scan the current orders again.');
    }).catch(() => {
      if (active) Alert.alert('Unable to restore orders', 'Local storage is unavailable. Your previous orders could not be loaded.');
    }).finally(() => { if (active) setHydrated(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeSession.current(encodeActiveSession(orders, acceptedReceiptFingerprints, Date.now(), {
      sequence: routePlan.sequence, source: routePlan.sequenceSource,
    })).catch(() => {
      Alert.alert('Orders not saved', 'This run is available now, but could not be saved for an app restart.');
    });
  }, [orders, acceptedReceiptFingerprints, hydrated, routePlan.sequence, routePlan.sequenceSource]);

  useEffect(() => () => {
    routeAbort.current?.abort();
    routeAbort.current = null;
  }, []);
  const { review: addressReview, selectCandidate, retry: retryAddress } = useAddressReview(
    draft?.address.formatted_address ?? '', screen === 'confirm' && Boolean(draft),
  );

  useEffect(() => {
    AsyncStorage.getItem(NAVIGATION_PREFERENCE_KEY).then((value) => {
      if (value === 'apple' || value === 'google') {
        setNavigationApp(value);
      }
    });
  }, []);

  const clearReceipt = () => {
    setReceiptEntry(null);
    setDraft(null);
    setCapturedReceipt(null);
    setReceiptScanResult(null);
    setError(null);
  };

  const beginReceipt = (replacementOrderId = null, destination = 'scanner') => {
    if (busy.current || !hydrated) return false;
    try {
      const entry = beginReceiptEntry(ordersRef.current, replacementOrderId);
      clearReceipt();
      setReceiptEntry({ ...entry, returnScreen: screen === 'orders' || ordersRef.current.length ? 'orders' : 'home' });
      setReceiptNotice(null);
      setScreen(destination);
      return true;
    } catch (caught) {
      Alert.alert('Unable to start receipt', caught.message);
      return false;
    }
  };

  const cancelReceipt = () => {
    if (busy.current) return;
    const returnScreen = entryRef.current?.returnScreen ?? 'home';
    clearReceipt();
    setScreen(returnScreen);
  };

  const retakeReceipt = () => {
    if (busy.current || !entryRef.current) return;
    setDraft(null);
    setCapturedReceipt(null);
    setReceiptScanResult(null);
    setError(null);
    setScreen('scanner');
  };

  const beginMockOrder = () => {
    if (!beginReceipt(null, 'confirm')) return;
    let next = mockReceipt(mockIndex.current++);
    while (orders.some((order) => order.order_id === next.order_id)) {
      next = { ...mockReceipt(mockIndex.current++), order_id: Date.now().toString().slice(-4) };
    }
    setDraft(next);
    setError(null);
    setScreen('confirm');
  };

  const finishReceiptCapture = (image) => {
    if (!entryRef.current) return;
    setCapturedReceipt(image);
    setReceiptScanResult(null);
    setScreen('recognizing');
  };

  const finishReceiptRecognition = (result) => {
    if (!entryRef.current) return;
    setReceiptScanResult(result);
    setDraft(createOrderDraftFromReceipt(result, undefined, { allowCorrection: true }));
    setError(null);
    setScreen('confirm');
  };

  const saveDraft = async () => {
    if (busy.current) return;
    const entry = entryRef.current;
    let prepared;
    try {
      prepared = prepareReceiptEntry(ordersRef.current, fingerprintsRef.current, entry, draft, receiptScanResult);
    } catch (caught) {
      setError(caught.message);
      return;
    }
    const locationError = addressReviewError(addressReview, draft.address.formatted_address);
    if (locationError) {
      setError(locationError);
      return;
    }
    busy.current = true;
    setLoading(true);
    try {
      if (!addressReview.lookupReference) throw new Error('Retry the address lookup before confirming.');
      const selected = selectedAddressCandidate(addressReview, draft.address.formatted_address);
      const address = await confirmAddress(draft.address.formatted_address,
        addressReview.lookupReference, selected.candidate_id);
      if (entryRef.current !== entry) return;
      const confirmedOrder = confirmAddressForOrder(prepared.draft, addressReview, address);
      const committed = commitReceiptEntry(ordersRef.current, fingerprintsRef.current, entry, confirmedOrder, prepared.receiptFingerprints);
      const preference = receiptEntryRoutePreference(planRef.current, entry, confirmedOrder.order_id);
      setOrders(committed.orders, preference);
      setFingerprints(committed.fingerprints);
      clearReceipt();
      setReceiptNotice(`Order #${confirmedOrder.order_id} ${entry.replacementOrderId === null ? 'added' : 'replaced'}.`);
      setScreen('orders');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to confirm this address.');
      if (!['map_usage_limit_reached', 'map_usage_unavailable', 'map_provider_rate_limited', 'map_provider_configuration_error'].includes(caught?.code)) retryAddress();
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  const requestRoute = async () => {
    if (!orders.length || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(null);
    updatePlan(beginRouteRequest(planRef.current));
    const ticket = { requestId: planRef.current.requestId, revision: planRef.current.revision };
    const controller = new AbortController();
    routeAbort.current = controller;
    const current = () => !controller.signal.aborted && isCurrentRouteRequest(planRef.current, ticket);
    try {
      let origin = restaurant;
      if (needsRestaurant) {
        const selected = selectedAddressCandidate(originReview.review, DEFAULT_RESTAURANT.formatted_address);
        if (!selected || !originReview.review.lookupReference) throw new Error('Check and select the restaurant starting location below.');
        origin = await confirmAddress(DEFAULT_RESTAURANT.formatted_address,
          originReview.review.lookupReference, selected.candidate_id, { signal: controller.signal });
        if (!current()) return;
      }
      const currentOrders = [];
      for (const order of orders) {
        currentOrders.push({ ...order, address: await ensureConfirmedAddress(order.address, { force: revalidateAll, signal: controller.signal }) });
        if (!current()) return;
      }
      if (!current()) return;
      const departureAt = new Date().toISOString();
      updatePlan(prepareRouteRequest(planRef.current, ticket, currentOrders, origin, departureAt));
      // These are confirmations obtained by this request, not a new driver edit.
      ordersRef.current = currentOrders;
      restaurantRef.current = origin;
      setOrdersState(currentOrders);
      setRestaurantState(origin);
      const result = await optimizeRoute(origin, currentOrders, { departureAt, signal: controller.signal });
      if (!current()) return;
      updatePlan(completeRouteRequest(planRef.current, ticket, result));
      setRevalidateAll(false);
      setScreen('route');
    } catch (caught) {
      if (!current()) return;
      updatePlan(failRouteRequest(planRef.current, ticket, caught instanceof Error ? caught.message : 'Unable to optimize this route.'));
      if (needsRestaurant && !['map_usage_limit_reached', 'map_usage_unavailable', 'map_provider_rate_limited', 'map_provider_configuration_error'].includes(caught?.code)) originReview.retry();
      if (caught?.code === 'location_review_required') {
        setRestaurant(null);
        setRevalidateAll(true);
      }
      setError(caught instanceof Error ? caught.message : 'Unable to optimize this route.');
    } finally {
      if (routeAbort.current === controller) {
        routeAbort.current = null;
        busy.current = false;
        setLoading(false);
      }
    }
  };

  const removeOrder = (orderId) => {
    Alert.alert('Remove order?', `Order #${orderId} will be removed from this route.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          if (busy.current) return;
          const removed = removeReceiptOrder(ordersRef.current, fingerprintsRef.current, orderId);
          setOrders(removed.orders);
          setFingerprints(removed.fingerprints);
          setReceiptNotice(null);
        },
      },
    ]);
  };

  const saveNavigationApp = async (value) => {
    setNavigationApp(value);
    await AsyncStorage.setItem(NAVIGATION_PREFERENCE_KEY, value);
  };

  const openRoute = async () => {
    if (!canNavigateRoute(planRef.current, ordersRef.current, restaurantRef.current)) {
      Alert.alert('Route needs recalculation', 'Review your current orders and calculate the route again before opening navigation.');
      return;
    }
    const navigationRoute = createNavigationRoute(navigationApp, planRef.current.route.ordered_stops, restaurantRef.current);
    if (!navigationRoute) return;

    if (!navigationRoute.includesAllStops) {
      Alert.alert(
        'Multi-stop navigation unavailable',
        'This version of Apple Maps cannot receive the complete route. Opening the first stop instead.',
      );
    }
    await Linking.openURL(navigationRoute.url);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.safeArea} pointerEvents={loading || !hydrated ? 'none' : 'auto'}>
      <StatusBar style="dark" />
      <Header screen={screen} onNavigate={(next) => {
        if (!busy.current && hydrated) { clearReceipt(); setScreen(next); }
      }} orderCount={orders.length} />
      {screen === 'home' && (
        <HomeScreen
          capturedReceipt={capturedReceipt}
          receiptScanResult={receiptScanResult}
          onMock={beginMockOrder}
          onScan={() => beginReceipt()}
          atCapacity={orders.length >= MAX_ACTIVE_ORDERS}
        />
      )}
      {screen === 'scanner' && (
        <ReceiptScannerScreen onCancel={cancelReceipt} onComplete={(image) => {
          if (entryRef.current === receiptEntry) finishReceiptCapture(image);
        }} />
      )}
      {screen === 'recognizing' && capturedReceipt && (
        <ReceiptRecognitionScreen
          image={capturedReceipt}
          acceptedReceiptFingerprints={receiptFingerprintsForEntry(orders, acceptedReceiptFingerprints, receiptEntry?.replacementOrderId)}
          replacementOrderId={receiptEntry?.replacementOrderId}
          onCancel={cancelReceipt}
          onComplete={(result) => { if (entryRef.current === receiptEntry) finishReceiptRecognition(result); }}
          onManual={() => {
            if (!receiptEntry || entryRef.current !== receiptEntry) return;
            setReceiptScanResult(null);
            setDraft(createManualReceiptDraft());
            setError(null);
            setScreen('confirm');
          }}
          onRetake={retakeReceipt}
        />
      )}
      {screen === 'confirm' && draft && (
        <ConfirmOrderScreen
          draft={draft}
          saving={loading}
          addressReview={addressReview}
          onSelectAddress={(id) => { if (!busy.current) { selectCandidate(id); setError(null); } }}
          onRetryAddress={retryAddress}
          onChange={(nextDraft) => { if (!busy.current) { setDraft(nextDraft); setError(null); } }}
          onSave={saveDraft}
          replacementOrderId={receiptEntry?.replacementOrderId}
          onCancel={cancelReceipt}
          onRetake={retakeReceipt}
          error={error}
        />
      )}
      {screen === 'orders' && (
        <OrdersScreen
          orders={orders}
          originReview={needsRestaurant && orders.length ? originReview : null}
          restaurant={restaurant}
          originReady={!needsRestaurant || !addressReviewError(originReview.review, DEFAULT_RESTAURANT.formatted_address)}
          onAdd={() => beginReceipt()}
          onRescan={(orderId) => beginReceipt(orderId)}
          receiptNotice={receiptNotice}
          onRemove={removeOrder}
          onOptimize={requestRoute}
          routeStatus={routePlan.status}
          onReviewRoute={() => setScreen('route')}
          loading={loading}
          error={error}
        />
      )}
      {screen === 'route' && (
        <RouteScreen
          route={route}
          restaurant={restaurant}
          navigationApp={navigationApp}
          onNavigate={openRoute}
          plan={routePlan}
          onReviewOrders={() => setScreen('orders')}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen value={navigationApp} onChange={saveNavigationApp} />
      )}
      </View>
      {routePlan.status === 'calculating' && <AppButton label="Cancel route calculation" onPress={() => {
        updatePlan(cancelRouteRequest(planRef.current));
        routeAbort.current?.abort();
        routeAbort.current = null;
        busy.current = false;
        setLoading(false);
        setError(null);
      }} secondary />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.parchment,
  },
});
