import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '../components/AppButton';
import { ErrorMessage } from '../components/ErrorMessage';
import { FormField } from '../components/FormField';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';

export function ConfirmOrderScreen({ draft, onChange, onSave, error }) {
  const isOcrDraft = draft.source === 'receipt-ocr';
  const update = (field, value) => {
    if (field === 'address') {
      onChange({ ...draft, address: { ...draft.address, formatted_address: value } });
      return;
    }
    onChange({ ...draft, [field]: value });
  };

  return (
    <ScrollView contentContainerStyle={commonStyles.content} keyboardShouldPersistTaps="handled">
      <Text style={commonStyles.eyebrow}>{isOcrDraft ? 'RECEIPT OCR COMPLETE' : 'MOCK EXTRACTION COMPLETE'}</Text>
      <Text style={commonStyles.title}>Confirm order</Text>
      <Text style={commonStyles.subtitle}>
        Compare every value with the physical receipt before adding it.
      </Text>
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
          ✓ {isOcrDraft ? 'Receipt address and order time recognized.' : 'Mock address recognized.'} Driver confirmation is still required.
        </Text>
      </View>
      {error && <ErrorMessage message={error} />}
      <AppButton label="Confirm and add order" onPress={onSave} />
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
