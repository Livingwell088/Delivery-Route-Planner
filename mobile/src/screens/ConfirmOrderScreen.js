import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { validateReceiptDraft } from '../services/receiptOrderDraft';
import { receiptReviewWarnings } from '../services/receiptConfidence';

import { AppButton } from '../components/AppButton';
import { ErrorMessage } from '../components/ErrorMessage';
import { FormField } from '../components/FormField';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';

export function ConfirmOrderScreen({ draft, onChange, onSave, error, onCancel, onRetake }) {
  const isOcrDraft = draft.source === 'receipt-ocr';
  const review = draft.receiptReview;
  const update = (field, value) => {
    if (field === 'address') {
      onChange({ ...draft,
        address: { ...draft.address, formatted_address: value } });
      return;
    }
    onChange({ ...draft, [field]: value });
  };

  return (
    <ScrollView contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled">
      <Text style={commonStyles.eyebrow}>{isOcrDraft ? 'RECEIPT REVIEW' : 'MOCK EXTRACTION COMPLETE'}</Text>
      <Text style={commonStyles.title}>Confirm order</Text>
      <Text style={commonStyles.subtitle}>
        Compare every value with the physical receipt before adding it.
      </Text>
      {review && (
        <Text style={commonStyles.subtitle}>
          {review.action === 'correct' ? 'Correct uncertain or missing details before adding this order.'
            : 'Verify the delivery address, unit and order time before adding this order.'}
        </Text>
      )}
      {receiptReviewWarnings(review).length > 0 && <Text style={commonStyles.eyebrow}>ORIGINAL SCAN WARNINGS</Text>}
      {receiptReviewWarnings(review).map((reason) => <Text key={reason} style={commonStyles.muted}>{reason}</Text>)}
      <FormField
        label="Order number"
        value={draft.order_id}
        onChangeText={(value) => update('order_id', value)}
      />
      <FormField
        label="Delivery address"
        value={draft.address.formatted_address}
        onChangeText={(value) => update('address', value)}
        multiline
      />
      <FormField
        label="Placed time (ISO)"
        value={draft.placedAt}
        onChangeText={(value) => update('placedAt', value)}
      />
      <View style={styles.successBox}>
        <Text style={styles.successText}>
          {isOcrDraft ? 'Check all details against the receipt. Include every suite, room or unit. If no ZIP is printed, explicitly verify the city and state.' : 'Mock address recognized. Driver confirmation is still required.'}
        </Text>
      </View>
      {isOcrDraft && validateReceiptDraft(draft) && <Text style={commonStyles.muted}>{validateReceiptDraft(draft)}</Text>}
      {error && <ErrorMessage message={error} />}
      <AppButton label="Confirm and add order" onPress={onSave} disabled={isOcrDraft && Boolean(validateReceiptDraft(draft))} />
      {isOcrDraft && <AppButton label="Rescan" onPress={onRetake} secondary />}
      <AppButton label="Cancel" onPress={onCancel} secondary />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  successBox: {
    backgroundColor: colors.successBackground,
    borderRadius: 12,
    padding: 14,
  },
  successText: {
    color: colors.successText,
    lineHeight: 20,
  },
});
