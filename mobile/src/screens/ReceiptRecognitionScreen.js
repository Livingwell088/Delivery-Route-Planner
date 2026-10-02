import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { RECEIPT_SCAN_STATUS } from '../domain/receiptScan';
import { recognizeReceipt } from '../services/receiptOcr';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';

export function ReceiptRecognitionScreen({ image, onCancel, onComplete, onRetake }) {
  const [status, setStatus] = useState(RECEIPT_SCAN_STATUS.PROCESSING);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    recognizeReceipt(image)
      .then((scanResult) => {
        if (!active) return;
        setResult(scanResult);
        setStatus(RECEIPT_SCAN_STATUS.SUCCEEDED);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught);
        setStatus(RECEIPT_SCAN_STATUS.FAILED);
      });
    return () => { active = false; };
  }, [image]);

  if (status === RECEIPT_SCAN_STATUS.PROCESSING) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.deepGold} size="large" />
        <Text style={styles.heading}>Reading receipt…</Text>
        <Text style={commonStyles.muted}>Recognizing text on this device.</Text>
      </View>
    );
  }

  if (status === RECEIPT_SCAN_STATUS.FAILED) {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>Couldn’t read receipt</Text>
        <Text style={styles.error}>{error?.message ?? 'Receipt text recognition failed.'}</Text>
        <View style={styles.actions}>
          <AppButton label="Retake" onPress={onRetake} />
          <AppButton label="Cancel" onPress={onCancel} secondary />
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={commonStyles.eyebrow}>OCR RESULT</Text>
      <Text style={commonStyles.title}>Recognized text</Text>
      <Text style={commonStyles.subtitle}>
        ML Kit found {result.blocks.length} text {result.blocks.length === 1 ? 'block' : 'blocks'}.
      </Text>
      <View style={styles.textCard}>
        <Text selectable style={styles.recognizedText}>{result.recognizedText}</Text>
      </View>
      <AppButton label="Continue" onPress={() => onComplete(result)} />
      <AppButton label="Retake" onPress={onRetake} secondary />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 30, justifyContent: 'center', alignItems: 'center', gap: 16, backgroundColor: colors.parchment },
  content: { padding: 22, paddingBottom: 48, gap: 14 },
  heading: { color: colors.ink, fontWeight: '800', fontSize: 26, textAlign: 'center' },
  error: { color: colors.errorText, lineHeight: 21, textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: 10 },
  textCard: { padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  recognizedText: { color: colors.ink, fontSize: 15, lineHeight: 22 },
});
