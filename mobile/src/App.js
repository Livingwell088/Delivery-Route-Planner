import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, SafeAreaView, StyleSheet } from 'react-native';

import { Header } from './components/Header';
import { NAVIGATION_PREFERENCE_KEY } from './constants/storage';
import { DEFAULT_RESTAURANT, mockReceipt } from './data/mockReceipts';
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
    setDraft(createOrderDraftFromReceipt(result, `OCR-${Date.now().toString().slice(-6)}`, { allowCorrection: true }));
    setError(null);
    setScreen('confirm');
  };

  const saveDraft = () => {
    const validationError = validateReceiptDraft(draft);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (orders.some((order) => order.order_id === draft.order_id)) {
      setError(`Order #${draft.order_id} is already in the list.`);
      return;
    }
    if (draft.source === 'receipt-ocr') {
      const fingerprint = createDraftReceiptFingerprint(draft);
      if (fingerprint && acceptedReceiptFingerprints.includes(fingerprint)) {
        setError('This destination and order time were already added.');
        return;
      }
      const originalFingerprint = createReceiptFingerprint(receiptScanResult);
      setAcceptedReceiptFingerprints((current) => [...new Set([...current, fingerprint, originalFingerprint].filter(Boolean))]);
    }
    setOrders((current) => [...current, draft]);
    setDraft(null);
    setRoute(null);
    setError(null);
    setScreen('orders');
  };

  const requestRoute = async () => {
    if (!orders.length) return;
    setLoading(true);
    setError(null);
    try {
      setRoute(await optimizeRoute(DEFAULT_RESTAURANT, orders));
      setScreen('route');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to optimize this route.');
    } finally {
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
          setOrders((current) => current.filter((order) => order.order_id !== orderId));
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
    const navigationRoute = createNavigationRoute(navigationApp, route?.ordered_stops ?? []);
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
      <StatusBar style="dark" />
      <Header screen={screen} onNavigate={setScreen} orderCount={orders.length} />
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
            setDraft(createManualReceiptDraft(`OCR-${Date.now().toString().slice(-6)}`));
            setError(null);
            setScreen('confirm');
          }}
          onRetake={() => setScreen('scanner')}
        />
      )}
      {screen === 'confirm' && draft && (
        <ConfirmOrderScreen
          draft={draft}
          onChange={setDraft}
          onSave={saveDraft}
          onCancel={() => { setDraft(null); setError(null); setScreen('home'); }}
          onRetake={() => { setDraft(null); setError(null); setScreen('scanner'); }}
          error={error}
        />
      )}
      {screen === 'orders' && (
        <OrdersScreen
          orders={orders}
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
