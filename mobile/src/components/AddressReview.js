import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppButton } from './AppButton';
import { colors } from '../theme/colors';
import { commonStyles } from '../theme/commonStyles';

export function AddressReview({ review, onSelect, onRetry }) {
  const checking = review.status === 'checking';
  return (
    <View style={styles.container}>
      <Text style={commonStyles.cardTitle}>Delivery location</Text>
      {review.status === 'idle' && <Text style={commonStyles.muted}>Enter the full address. It will be checked after you pause typing.</Text>}
      {checking && <View style={styles.loading}>
        <ActivityIndicator color={colors.deepGold} accessibilityLabel="Checking delivery address" />
        <Text style={commonStyles.muted}>Checking delivery address…</Text>
      </View>}
      {review.status === 'error' && <Text accessibilityRole="alert" style={commonStyles.muted}>{review.error}</Text>}
      {review.status === 'invalid' && <Text accessibilityRole="alert" style={commonStyles.muted}>This address could not be located precisely. Correct it before adding the order.</Text>}
      {review.status === 'needs_selection' && <Text style={commonStyles.muted}>Several locations were found. Choose the one on the receipt.</Text>}
      {review.status === 'needs_confirmation' && <Text style={commonStyles.muted}>Compare the recognized location with the receipt. Choose a result below if it needs review.</Text>}
      {review.unit && <Text style={commonStyles.muted}>Unit: {review.unit} — preserved; Google Maps has not verified it.</Text>}
      {review.candidates.length > 0 && <View accessibilityRole="radiogroup" accessibilityLabel="Delivery address candidates" style={styles.list}>
        {review.candidates.map((candidate, index) => {
          const selected = review.selectedCandidateId === candidate.candidate_id;
          const disabled = candidate.is_usable !== true || review.status === 'invalid';
          return <Pressable key={`${candidate.candidate_id ?? 'candidate'}-${index}`}
            accessibilityRole="radio"
            accessibilityLabel={`${selected ? 'Selected: ' : ''}${candidate.normalized_address ?? 'Address unavailable'}`}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled} onPress={() => onSelect(candidate.candidate_id)}
            style={[styles.candidate, selected && styles.selected, disabled && styles.disabled]}>
            <Text style={commonStyles.cardTitle}>{selected ? 'Selected destination' : disabled ? 'Correction hint only' : 'Use this destination'}</Text>
            <Text style={commonStyles.muted}>{candidate.normalized_address}</Text>
            {(Array.isArray(candidate.warnings) ? candidate.warnings : []).map((warning, i) => <Text key={i} style={commonStyles.muted}>{warning}</Text>)}
          </Pressable>;
        })}
      </View>}
      {review.status !== 'idle' && !checking && <Text style={styles.attribution}>Google Maps</Text>}
      {['error', 'invalid'].includes(review.status) && <AppButton label="Retry address lookup" onPress={onRetry} secondary />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  list: { gap: 10 },
  candidate: { padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, gap: 6 },
  selected: { borderColor: colors.deepGold, backgroundColor: colors.cream },
  disabled: { opacity: 0.65 },
  attribution: { fontSize: 12, fontWeight: '400', color: '#1F1F1F' },
});
