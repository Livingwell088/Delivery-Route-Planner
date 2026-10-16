import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, SafeAreaView, StyleSheet } from 'react-native';

import { Header } from './components/Header';
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
import { createReceiptFingerprint, createDraftReceiptFingerprint } from './services/receiptDuplicate';
import { createOrderDraftFromReceipt, createManualReceiptDraft, validateReceiptDraft } from './services/receiptOrderDraft';
import { optimizeRoute } from './services/routeApi';
import { addressReviewError, selectedAddressCandidate, confirmAddressForOrder } from './services/addressReview';
import { confirmAddress, ensureConfirmedAddress } from './services/addressApi';
import { ACTIVE_SESSION_KEY, createSessionWriter, decodeActiveSession, encodeActiveSession } from './services/activeSession';
import { colors } from './theme/colors';

export default function App() {
  const [screen, setScreen] = useState('home');
  const [orders, setOrders] = useState([]);
  const [draft, setDraft] = useState(null);
  const [route, setRoute] = useState(null);
  const [navigationApp, setNavigationApp] = useState('google');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [capturedReceipt, setCapturedReceipt] = useState(null);
  const [receiptScanResult, setReceiptScanResult] = useState(null);
  const [acceptedReceiptFingerprints, setAcceptedReceiptFingerprints] = useState([]);
  const mockIndex = useRef(0);
  const busy = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [restaurant, setRestaurant] = useState(null);
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
      setOrders(restored.orders);
      setAcceptedReceiptFingerprints(restored.fingerprints);
      if (restored.orders.length) setScreen('orders');
      if (restored.discarded) Alert.alert('Previous run cleared', 'The saved delivery run expired or could not be restored. Scan the current orders again.');
    }).catch(() => {
      if (active) Alert.alert('Unable to restore orders', 'Local storage is unavailable. Your previous orders could not be loaded.');
    }).finally(() => { if (active) setHydrated(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    writeSession.current(encodeActiveSession(orders, acceptedReceiptFingerprints)).catch(() => {
      Alert.alert('Orders not saved', 'This run is available now, but could not be saved for an app restart.');
    });
  }, [orders, acceptedReceiptFingerprints, hydrated]);
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

  const beginMockOrder = () => {
    let next = mockReceipt(mockIndex.current++);
    while (orders.some((order) => order.order_id === next.order_id)) {
      next = { ...mockReceipt(mockIndex.current++), order_id: Date.now().toString().slice(-4) };
    }
    setDraft(next);
    setError(null);
    setScreen('confirm');
  };

  const finishReceiptCapture = (image) => {
    setCapturedReceipt(image);
    setReceiptScanResult(null);
    setScreen('recognizing');
  };

  const finishReceiptRecognition = (result) => {
    setReceiptScanResult(result);
    setDraft(createOrderDraftFromReceipt(result, undefined, { allowCorrection: true }));
    setError(null);
    setScreen('confirm');
  };

  const saveDraft = async () => {
    if (busy.current) return;
    const validationError = validateReceiptDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    const locationError = addressReviewError(addressReview, draft.address.formatted_address);
    if (locationError) {
      setError(locationError);
      return;
    }
    if (orders.some((order) => order.order_id === draft.order_id)) {
      setError(`Order #${draft.order_id} is already in the list.`);
      return;
    }
    const fingerprint = draft.source === 'receipt-ocr' ? createDraftReceiptFingerprint(draft) : null;
    if (fingerprint && acceptedReceiptFingerprints.includes(fingerprint)) {
      setError('This destination and order time were already added.');
      return;
    }
    busy.current = true;
    setLoading(true);
    try {
      if (!addressReview.lookupReference) throw new Error('Retry the address lookup before confirming.');
      const selected = selectedAddressCandidate(addressReview, draft.address.formatted_address);
      const address = await confirmAddress(draft.address.formatted_address,
        addressReview.lookupReference, selected.candidate_id);
      const confirmedOrder = confirmAddressForOrder(draft, addressReview, address);
      const originalFingerprint = draft.source === 'receipt-ocr' ? createReceiptFingerprint(receiptScanResult) : null;
      setAcceptedReceiptFingerprints((current) => [...new Set([...current, fingerprint, originalFingerprint].filter(Boolean))]);
      setOrders((current) => [...current, { ...confirmedOrder, receiptFingerprints: [fingerprint, originalFingerprint].filter(Boolean) }]);
      setDraft(null);
      setRoute(null);
      setError(null);
      setScreen('orders');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to confirm this address.');
      retryAddress();
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
    try {
      let origin = restaurant;
      if (needsRestaurant) {
        const selected = selectedAddressCandidate(originReview.review, DEFAULT_RESTAURANT.formatted_address);
        if (!selected || !originReview.review.lookupReference) throw new Error('Check and select the restaurant starting location below.');
        origin = await confirmAddress(DEFAULT_RESTAURANT.formatted_address,
          originReview.review.lookupReference, selected.candidate_id);
        setRestaurant(origin);
      }
      const currentOrders = [];
      for (const order of orders) {
        currentOrders.push({ ...order, address: await ensureConfirmedAddress(order.address, { force: revalidateAll }) });
      }
      setOrders(currentOrders);
      setRoute(await optimizeRoute(origin, currentOrders));
      setRevalidateAll(false);
      setScreen('route');
    } catch (caught) {
      if (needsRestaurant) originReview.retry();
      if (caught?.code === 'location_review_required') {
        setRestaurant(null);
        setRevalidateAll(true);
      }
      setError(caught instanceof Error ? caught.message : 'Unable to optimize this route.');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  const removeOrder = (orderId) => {
    Alert.alert('Remove order?', `Order #${orderId} will be removed from this route.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const remaining = orders.filter((order) => order.order_id !== orderId);
          setOrders(remaining);
          setAcceptedReceiptFingerprints([...new Set(remaining.flatMap((order) => order.receiptFingerprints ?? []))]);
          setRoute(null);
        },
      },
    ]);
  };

  const saveNavigationApp = async (value) => {
    setNavigationApp(value);
    await AsyncStorage.setItem(NAVIGATION_PREFERENCE_KEY, value);
  };

  const openRoute = async () => {
    const navigationRoute = createNavigationRoute(navigationApp, route?.ordered_stops ?? [], restaurant ?? DEFAULT_RESTAURANT);
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
    <SafeAreaView style={styles.safeArea} pointerEvents={loading || !hydrated ? 'none' : 'auto'}>
      <StatusBar style="dark" />
      <Header screen={screen} onNavigate={(next) => { if (!busy.current && hydrated) setScreen(next); }} orderCount={orders.length} />
      {screen === 'home' && (
        <HomeScreen
          capturedReceipt={capturedReceipt}
          receiptScanResult={receiptScanResult}
          onMock={beginMockOrder}
          onScan={() => setScreen('scanner')}
        />
      )}
      {screen === 'scanner' && (
        <ReceiptScannerScreen onCancel={() => setScreen('home')} onComplete={finishReceiptCapture} />
      )}
      {screen === 'recognizing' && capturedReceipt && (
        <ReceiptRecognitionScreen
          image={capturedReceipt}
          acceptedReceiptFingerprints={acceptedReceiptFingerprints}
          onCancel={() => setScreen('home')}
          onComplete={finishReceiptRecognition}
          onManual={() => {
            setReceiptScanResult(null);
            setDraft(createManualReceiptDraft());
            setError(null);
            setScreen('confirm');
          }}
          onRetake={() => setScreen('scanner')}
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
          onCancel={() => { if (!busy.current) { setDraft(null); setError(null); setScreen('home'); } }}
          onRetake={() => { if (!busy.current) { setDraft(null); setError(null); setScreen('scanner'); } }}
          error={error}
        />
      )}
      {screen === 'orders' && (
        <OrdersScreen
          orders={orders}
          originReview={needsRestaurant && orders.length ? originReview : null}
          restaurant={restaurant}
          originReady={!needsRestaurant || !addressReviewError(originReview.review, DEFAULT_RESTAURANT.formatted_address)}
          onAdd={() => setScreen('home')}
          onRemove={removeOrder}
          onOptimize={requestRoute}
          loading={loading}
          error={error}
        />
      )}
      {screen === 'route' && route && (
        <RouteScreen
          route={route}
          restaurant={restaurant}
          navigationApp={navigationApp}
          onNavigate={openRoute}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen value={navigationApp} onChange={saveNavigationApp} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.parchment,
  },
});
