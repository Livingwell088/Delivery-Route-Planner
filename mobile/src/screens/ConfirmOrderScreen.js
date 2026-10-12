import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { validateReceiptDraft } from '../services/receiptOrderDraft';

import { AppButton } from '../components/AppButton';
import { ErrorMessage } from '../components/ErrorMessage';
import { FormField } from '../components/FormField';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';

export function ConfirmOrderScreen({ draft, onChange, onSave, error, onCancel, onRetake }) {
  const isOcrDraft = draft.source === 'receipt-ocr';
  const review = draft.receiptReview;
  const update = (field, value) => {
    const nextReview = review ? { ...review, addressConfirmed: false, timeConfirmed: false } : null;
    if (field === 'address') {
      onChange({ ...draft, ...(review ? { receiptReview: nextReview } : {}),
        address: { ...draft.address, formatted_address: value } });
      return;
    }
    onChange({ ...draft, ...(review ? { receiptReview: nextReview } : {}), [field]: value });
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
      {review?.reasons.map((reason) => <Text key={reason} style={commonStyles.muted}>{reason}</Text>)}
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
      {review && ['address', 'time'].map((field) => (
        <View key={field} style={styles.reviewRow}>
          <Text style={commonStyles.muted}>{field === 'address'
            ? 'I verified the full destination and all unit details.' : 'I verified the placed date and time.'}</Text>
          <Switch value={review[`${field}Confirmed`]} onValueChange={(value) =>
            onChange({ ...draft, receiptReview: { ...review, [`${field}Confirmed`]: value } })} />
        </View>
      ))}
      {isOcrDraft && validateReceiptDraft(draft) && <Text style={commonStyles.muted}>{validateReceiptDraft(draft)}</Text>}
      {error && <ErrorMessage message={error} />}
      <AppButton label="Confirm and add order" onPress={onSave} disabled={isOcrDraft && Boolean(validateReceiptDraft(draft))} />
      {isOcrDraft && <AppButton label="Rescan" onPress={onRetake} secondary />}
      <AppButton label="Cancel" onPress={onCancel} secondary />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  reviewRow: { gap: 8, alignItems: 'flex-start' },
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
