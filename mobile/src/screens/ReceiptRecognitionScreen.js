import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { RECEIPT_SCAN_STATUS } from '../domain/receiptScan';
import { recognizeReceipt } from '../services/receiptOcr';
import { isReceiptScanUsable } from '../services/receiptConfidence';
import { isDuplicateReceipt } from '../services/receiptDuplicate';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';

export function ReceiptRecognitionScreen({
  image,
  acceptedReceiptFingerprints = [],
  onCancel,
  onComplete,
  onRetake,
}) {
  const [status, setStatus] = useState(RECEIPT_SCAN_STATUS.PROCESSING);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const signaledResult = useRef(null);

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

  useEffect(() => {
    if (
      status !== RECEIPT_SCAN_STATUS.SUCCEEDED
      || !result
      || signaledResult.current === result
      || !isReceiptScanUsable(result)
      || isDuplicateReceipt(result, acceptedReceiptFingerprints)
    ) return;

    signaledResult.current = result;
    Vibration.vibrate(100);
  }, [acceptedReceiptFingerprints, result, status]);

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

  const duplicate = isDuplicateReceipt(result, acceptedReceiptFingerprints);
  const usable = isReceiptScanUsable(result) && !duplicate;

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
      <View style={styles.confidenceCard}>
        <Text style={commonStyles.cardTitle}>
          {duplicate ? 'Duplicate receipt' : usable ? 'Receipt is ready' : 'Receipt needs review'}
        </Text>
        <Text style={commonStyles.muted}>
          {duplicate
            ? 'This address and order time were already accepted.'
            : `Overall confidence: ${Math.round(result.confidence.value * 100)}%`}
        </Text>
      </View>
      <Text style={commonStyles.eyebrow}>ADDRESS CANDIDATES</Text>
      {result.addressCandidates.length ? result.addressCandidates.map((candidate, index) => (
        <View key={candidate.id} style={styles.candidateCard}>
          <Text style={commonStyles.cardTitle}>
            {index === 0 ? 'Best match' : `Alternative ${index}`}
          </Text>
          <Text selectable style={styles.recognizedText}>
            {candidate.streetAddress}{'\n'}
            {candidate.city}, {candidate.state} {candidate.postalCode}
          </Text>
          <Text style={commonStyles.muted}>
            {Math.round(candidate.confidence.value * 100)}% confidence
          </Text>
        </View>
      )) : (
        <Text style={commonStyles.muted}>No complete address candidate was found.</Text>
      )}
      <Text style={commonStyles.eyebrow}>ORDER TIME CANDIDATES</Text>
      {result.timestampCandidates.length ? result.timestampCandidates.map((candidate, index) => (
        <View key={candidate.id} style={styles.candidateCard}>
          <Text style={commonStyles.cardTitle}>
            {index === 0 ? 'Best match' : `Alternative ${index}`}
          </Text>
          <Text selectable style={styles.recognizedText}>
            {candidate.rawDate} at {candidate.rawTime}
          </Text>
          <Text style={commonStyles.muted}>
            {Math.round(candidate.confidence.value * 100)}% confidence
          </Text>
        </View>
      )) : (
        <Text style={commonStyles.muted}>No complete order timestamp was found.</Text>
      )}
      <AppButton
        label={duplicate ? 'Receipt already added' : usable ? 'Continue' : 'Required information missing'}
        onPress={() => onComplete(result)}
        disabled={!usable}
      />
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
  candidateCard: { padding: 18, gap: 8, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  confidenceCard: { padding: 18, gap: 8, borderRadius: 16, backgroundColor: colors.card },
  recognizedText: { color: colors.ink, fontSize: 15, lineHeight: 22 },
});
