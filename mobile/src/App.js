import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, NativeModules, Platform, SafeAreaView, StyleSheet, View } from 'react-native';

import { Header } from './components/Header';
import { AppButton } from './components/AppButton';
import { SessionRecoveryNotice } from './components/SessionRecoveryNotice';
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
import { openRouteNavigation } from './services/navigationHandoff';
import { createNavigationPreference } from './services/navigationPreferences';
import { createNavigationSelection, currentNavigationSelection } from './services/navigationSelection';
import { createOrderDraftFromReceipt, createManualReceiptDraft } from './services/receiptOrderDraft';
import { MAX_ACTIVE_ORDERS, beginReceiptEntry, prepareReceiptEntry, commitReceiptEntry,
  receiptFingerprintsForEntry, removeReceiptOrder, receiptEntryRoutePreference } from './services/receiptEntry';
import { optimizeRoute, evaluateRoute } from './services/routeApi';
import { addressReviewError, selectedAddressCandidate, confirmAddressForOrder } from './services/addressReview';
import { confirmAddress, ensureConfirmedAddress } from './services/addressApi';
import { createSessionPersistence, encodeActiveSession } from './services/activeSession';
import { colors } from './theme/colors';
import { createRoutePlan, changeRouteInputs, beginRouteRequest, isCurrentRouteRequest,
  prepareRouteRequest, completeRouteRequest, failRouteRequest, cancelRouteRequest, expireRoutePlan, nextConfirmationExpiry,
  moveRouteStop, ordersInRouteOrder } from './services/routePlan';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [orders, setOrdersState] = useState([]);
  const [draft, setDraft] = useState(null);
  const [routePlan, setRoutePlan] = useState(createRoutePlan);
  const planRef = useRef(routePlan);
  const ordersRef = useRef([]);
  const restaurantRef = useRef(null);
  const routeAbort = useRef(null);
  const [navigationSelection, setNavigationSelectionState] = useState(null);
  const navigationSelectionRef = useRef(null);
  const [navigationPending, setNavigationPending] = useState(false);
  const route = routePlan.route;
  const updatePlan = (next) => {
    if (next.route !== planRef.current.route) {
      navigationSelectionRef.current = null;
      setNavigationSelectionState(null);
    }
    planRef.current = next; setRoutePlan(next);
  };
  const setOrders = (value, preference) => {
    const next = typeof value === 'function' ? value(ordersRef.current) : value;
    ordersRef.current = next;
    updatePlan(changeRouteInputs(planRef.current, next, restaurantRef.current, preference));
    setOrdersState(next);
  };
  const [navigationApp, setNavigationApp] = useState('google');
  const navigationAppRef = useRef('google');
  const navigationPreference = useRef(null);
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
  const mounted = useRef(true);
  const restoreBusy = useRef(false);
  const navigationBusy = useRef(false);
  if (!navigationPreference.current) navigationPreference.current = createNavigationPreference(
    AsyncStorage, NAVIGATION_PREFERENCE_KEY,
    (value) => { navigationAppRef.current = value; if (mounted.current) setNavigationApp(value); },
    () => { if (mounted.current) Alert.alert('Preference not saved', 'Your choice works now but could not be saved for a restart.'); },
  );
  const [storageStatus, setStorageStatus] = useState({ kind: 'loading' });
  const persistence = useRef(null);
  if (!persistence.current) persistence.current = createSessionPersistence(AsyncStorage, (status) => {
    if (mounted.current) setStorageStatus(status);
  });
  const [, setClockTick] = useState(0);
  const needsRestaurant = !restaurant || Date.parse(restaurant.validated_location.expires_at) <= Date.now();
  const originReview = useAddressReview(DEFAULT_RESTAURANT.formatted_address,
    hydrated && screen === 'orders' && orders.length > 0 && needsRestaurant);

  const restoreRun = async () => {
    if (restoreBusy.current) return;
    restoreBusy.current = true;
    setHydrated(false);
    try {
      const restored = await persistence.current.restore();
      if (!mounted.current) return;
      setOrders(restored.orders, restored.routePreference);
      setFingerprints(restored.fingerprints);
      if (restored.orders.length) setScreen('orders');
      if (restored.discarded) Alert.alert('Previous run cleared', 'The saved delivery run expired or could not be restored. Scan the current orders again.');
    } catch { /* The persistent recovery notice offers retry without overwriting saved data. */ }
    finally { restoreBusy.current = false; if (mounted.current) setHydrated(true); }
  };

  useEffect(() => {
    mounted.current = true;
    void restoreRun();
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void persistence.current.save(encodeActiveSession(orders, acceptedReceiptFingerprints, Date.now(), {
      sequence: routePlan.sequence, source: routePlan.sequenceSource,
    }));
  }, [orders, acceptedReceiptFingerprints, hydrated, routePlan.sequence, routePlan.sequenceSource]);

  useEffect(() => {
    let timer;
    const refresh = () => {
      setClockTick((value) => value + 1);
      const next = expireRoutePlan(planRef.current, ordersRef.current, restaurantRef.current);
      if (next !== planRef.current) updatePlan(next);
    };
    const schedule = () => {
      const deadline = nextConfirmationExpiry(ordersRef.current, restaurantRef.current);
      if (deadline !== null) timer = setTimeout(() => { refresh(); schedule(); }, Math.min(2147483647, Math.max(1, deadline - Date.now() + 1)));
    };
    refresh();
    schedule();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') { clearTimeout(timer); refresh(); schedule(); }
    });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, [orders, restaurant, routePlan.status]);

  useEffect(() => () => {
    routeAbort.current?.abort();
    routeAbort.current = null;
  }, []);
  const { review: addressReview, selectCandidate, retry: retryAddress } = useAddressReview(
    draft?.address.formatted_address ?? '', screen === 'confirm' && Boolean(draft),
  );

  useEffect(() => {
    void navigationPreference.current.restore();
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
    if (storageStatus.kind === 'restore_failed') {
      Alert.alert('Saved run unavailable', 'Retry loading your saved orders or choose Start new run first.');
      return false;
    }
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
      if (!mounted.current || entryRef.current !== entry) return;
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

  const requestRoute = async (mode) => {
    if (!ordersRef.current.length || busy.current) return;
    const originNeedsReview = !restaurantRef.current || Date.parse(restaurantRef.current.validated_location.expires_at) <= Date.now();
    if (originNeedsReview && screen !== 'orders') {
      setError('Review the restaurant starting location below, then choose recalculation or optimization.');
      setScreen('orders');
      return;
    }
    busy.current = true;
    setLoading(true);
    setError(null);
    const sequence = [...planRef.current.sequence];
    updatePlan(beginRouteRequest(planRef.current, mode));
    const ticket = { requestId: planRef.current.requestId, revision: planRef.current.revision };
    const controller = new AbortController();
    routeAbort.current = controller;
    const current = () => !controller.signal.aborted && isCurrentRouteRequest(planRef.current, ticket);
    try {
      let origin = restaurantRef.current;
      if (originNeedsReview) {
        const selected = selectedAddressCandidate(originReview.review, DEFAULT_RESTAURANT.formatted_address);
        if (!selected || !originReview.review.lookupReference) throw new Error('Check and select the restaurant starting location below.');
        origin = await confirmAddress(DEFAULT_RESTAURANT.formatted_address,
          originReview.review.lookupReference, selected.candidate_id, { signal: controller.signal });
        if (!current()) return;
      }
      const currentOrders = [];
      for (const order of ordersRef.current) {
        try {
          currentOrders.push({ ...order, address: await ensureConfirmedAddress(order.address, { force: revalidateAll, signal: controller.signal }) });
        } catch (caught) { caught.orderId = order.order_id; throw caught; }
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
      const options = { departureAt, signal: controller.signal };
      const result = mode === 'evaluate' ? await evaluateRoute(origin, currentOrders, sequence, options)
        : await optimizeRoute(origin, currentOrders, options);
      if (!current()) return;
      updatePlan(completeRouteRequest(planRef.current, ticket, result));
      setRevalidateAll(false);
      setScreen('route');
    } catch (caught) {
      if (!current()) return;
      updatePlan(failRouteRequest(planRef.current, ticket, caught instanceof Error ? caught.message : 'Unable to calculate this route.'));
      if (originNeedsReview && !caught.orderId && !['map_usage_limit_reached', 'map_usage_unavailable', 'map_provider_rate_limited', 'map_provider_configuration_error'].includes(caught?.code)) originReview.retry();
      if (caught?.code === 'location_review_required' && !caught.orderId) {
        setRestaurant(null);
        setRevalidateAll(true);
      }
      if (caught.orderId && ['order_location_review_required', 'location_review_required'].includes(caught?.code)) {
        setScreen('orders');
        caught.message = `Order #${caught.orderId} needs location review. Use its ••• menu to rescan and confirm the destination.`;
      }
      setError(caught instanceof Error ? caught.message : 'Unable to calculate this route.');
    } finally {
      if (routeAbort.current === controller) {
        routeAbort.current = null;
        busy.current = false;
        setLoading(false);
      }
    }
  };

  const moveStop = (orderId, direction) => {
    if (busy.current || !hydrated) return;
    try {
      updatePlan(moveRouteStop(planRef.current, orderId, direction, ordersRef.current));
      setError(null);
    } catch (caught) { setError(caught.message); }
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

  const saveNavigationApp = (value) => { void navigationPreference.current.select(value); };

  const selectNavigation = (mode, destinationIndex = 0) => {
    if (navigationBusy.current || planRef.current.status !== 'ready') return;
    const next = createNavigationSelection(planRef.current.route, mode, destinationIndex);
    if (next) { navigationSelectionRef.current = next; setNavigationSelectionState(next); }
  };

  const navigationDialog = (title, message, choices) => new Promise((resolve) => {
    if (!mounted.current) { resolve(null); return; }
    Alert.alert(title, message, [
      ...choices.map((choice) => ({ text: choice.label, onPress: () => resolve(choice.value) })),
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });

  const openRoute = async ({ forceChoice = false } = {}) => {
    if (navigationBusy.current || busy.current) return;
    navigationBusy.current = true;
    setNavigationPending(true);
    const handoffRoute = planRef.current.route;
    const selection = currentNavigationSelection(navigationSelectionRef.current, handoffRoute);
    try {
      const result = await openRouteNavigation({
        getCurrent: () => ({ plan: planRef.current, orders: ordersRef.current, restaurant: restaurantRef.current,
          navigationApp: navigationAppRef.current, active: mounted.current,
          navigationSelection: navigationSelectionRef.current }),
        navigationApp: navigationAppRef.current, platform: Platform, openURL: (url) => Linking.openURL(url),
        mode: selection.mode, destinationIndex: selection.destinationIndex,
        canOpenURL: (url) => Linking.canOpenURL(url), androidMaps: NativeModules.RouteNavigation, forceChoice,
        chooseAlternative: ({ availability, alternatives }) => navigationDialog('Choose navigation',
          forceChoice ? 'Choose an option for this launch. Your saved preference stays the same.'
            : availability === 'unknown' ? 'The preferred app could not be verified. Choose an option for this launch.'
              : 'The preferred app is unavailable on this device. Choose an option for this launch.',
          alternatives.map((option) => ({ label: option.label, value: option }))),
        notifyFallback: () => navigationDialog('One-stop navigation',
          'Open one destination at a time. Return to RouteRunner to select the next delivery or the restaurant.',
          [{ label: 'Continue', value: true }]),
      });
      if (!mounted.current) return;
      if (result.mode === 'single_destination' && planRef.current.route === handoffRoute) {
        const next = createNavigationSelection(handoffRoute, result.mode, result.destinationIndex);
        navigationSelectionRef.current = next; setNavigationSelectionState(next);
      }
      if (result.status === 'opened' || result.status === 'cancelled') return;
      if (result.status === 'failed') {
        Alert.alert('Unable to open navigation', result.message, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Retry', onPress: () => { void openRoute(); } },
          { text: 'Other options', onPress: () => { void openRoute({ forceChoice: true }); } },
        ]);
        return;
      }
      if (result.status === 'invalid') { Alert.alert('Review navigation destinations', result.message); return; }
      updatePlan(expireRoutePlan(planRef.current, ordersRef.current, restaurantRef.current));
      Alert.alert('Route needs recalculation', 'Review your current orders and calculate the route again before opening navigation.');
    } finally { navigationBusy.current = false; if (mounted.current) setNavigationPending(false); }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.safeArea} pointerEvents={loading || !hydrated ? 'none' : 'auto'}>
      <StatusBar style="dark" />
      <Header screen={screen} onNavigate={(next) => {
        if (!busy.current && hydrated) { clearReceipt(); setScreen(next); }
      }} orderCount={orders.length} />
      <SessionRecoveryNotice status={storageStatus} onRetryRestore={restoreRun}
        onRetrySave={() => { void persistence.current.retrySave(); }}
        onStartNew={() => Alert.alert('Start a new run?', 'This will replace the saved run that could not be loaded.', [
          { text: 'Cancel', style: 'cancel' }, { text: 'Start new run', style: 'destructive', onPress: () => {
            persistence.current.startNewRun(); clearReceipt(); setOrders([]); setFingerprints([]); setScreen('home');
          } },
        ])} />
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
          orders={ordersInRouteOrder(routePlan, orders)}
          originReview={needsRestaurant && orders.length ? originReview : null}
          restaurant={restaurant}
          originReady={!needsRestaurant || !addressReviewError(originReview.review, DEFAULT_RESTAURANT.formatted_address)}
          onAdd={() => beginReceipt()}
          onRescan={(orderId) => beginReceipt(orderId)}
          receiptNotice={receiptNotice}
          onRemove={removeOrder}
          onOptimize={() => requestRoute('optimize')}
          onRecalculate={() => requestRoute('evaluate')}
          preserveSequence={routePlan.sequenceSource === 'manual' || routePlan.requestId > 0}
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
          navigationSelection={currentNavigationSelection(navigationSelection, route)}
          onNavigationMode={(mode) => selectNavigation(mode)}
          onNavigationDestination={(index) => selectNavigation('single_destination', index)}
          navigationPending={navigationPending}
          plan={routePlan}
          orders={ordersInRouteOrder(routePlan, orders)}
          onMove={moveStop}
          onRemove={removeOrder}
          onRecalculate={() => requestRoute('evaluate')}
          onOptimize={() => requestRoute('optimize')}
          error={error}
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
