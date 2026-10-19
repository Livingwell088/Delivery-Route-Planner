import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { validateReceiptDraft } from '../services/receiptOrderDraft';
import { receiptReviewWarnings } from '../services/receiptConfidence';
import { addressReviewError, updateDraftAddress } from '../services/addressReview';

import { AppButton } from '../components/AppButton';
import { AddressReview } from '../components/AddressReview';
import { ErrorMessage } from '../components/ErrorMessage';
import { FormField } from '../components/FormField';
import { PlacedTimeField } from '../components/PlacedTimeField';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';

export function ConfirmOrderScreen({ draft, addressReview, onSelectAddress, onRetryAddress,
  onChange, onSave, error, onCancel, onRetake, saving = false, replacementOrderId = null }) {
  const replacing = replacementOrderId !== null;
  const isOcrDraft = draft.source === 'receipt-ocr';
  const review = draft.receiptReview;
  const receiptError = validateReceiptDraft(draft);
  const locationError = addressReviewError(addressReview, draft.address.formatted_address);
  const update = (field, value) => {
    if (field === 'address') {
      onChange(updateDraftAddress(draft, value));
      return;
    }
    onChange({ ...draft, [field]: value });
  };

  return (
    <ScrollView contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled">
      <Text style={commonStyles.eyebrow}>{isOcrDraft ? 'RECEIPT REVIEW' : 'MOCK EXTRACTION COMPLETE'}</Text>
      <Text style={commonStyles.title}>{replacing ? `Replace order #${replacementOrderId}` : 'Confirm order'}</Text>
      <Text style={commonStyles.subtitle}>
        {replacing ? 'The original order stays in your run until you confirm this replacement. Review the new order number, address, unit and placed time.'
          : 'Compare every value with the physical receipt before adding it.'}
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
        editable={!saving}
        value={draft.order_id}
        onChangeText={(value) => update('order_id', value)}
      />
      <FormField
        label="Delivery address"
        editable={!saving}
        value={draft.address.formatted_address}
        onChangeText={(value) => update('address', value)}
        multiline
      />
      <PlacedTimeField
        editable={!saving}
        value={draft.placedAt}
        onChange={(value) => update('placedAt', value)}
      />
      <AddressReview review={addressReview} onSelect={onSelectAddress} onRetry={onRetryAddress} />
      <View style={styles.successBox}>
        <Text style={styles.successText}>
          Check all details against the receipt, including the recognized destination and every suite, room or unit. {replacing
            ? `Confirming replaces order #${replacementOrderId} in its existing position and confirms your selected location.`
            : 'Confirming adds the order and confirms your selected location.'}
        </Text>
      </View>
      {receiptError && <Text style={commonStyles.muted}>{receiptError}</Text>}
      {!receiptError && locationError && addressReview.status !== 'error' && <Text style={commonStyles.muted}>{locationError}</Text>}
      {error && <ErrorMessage message={error} />}
      <AppButton label={saving ? 'Confirming…' : replacing ? 'Confirm and replace order' : 'Confirm and add order'} onPress={onSave} disabled={Boolean(saving || receiptError || locationError)} />
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
