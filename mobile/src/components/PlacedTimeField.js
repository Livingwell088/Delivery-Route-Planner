import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { FormField } from './FormField';
import { editPlacedTime, formatPlacedTime } from '../services/placedTime';
import { commonStyles } from '../theme/commonStyles';

export function PlacedTimeField({ value, onChange, editable = true }) {
  const [text, setText] = useState(() => formatPlacedTime(value));
  const [invalid, setInvalid] = useState(false);
  const anchor = useRef(value || new Date().toISOString());
  const emitted = useRef(value);
  useEffect(() => {
    if (value === emitted.current) return;
    anchor.current = value || new Date().toISOString();
    setText(formatPlacedTime(value));
    setInvalid(false);
    emitted.current = value;
  }, [value]);
  const update = (next) => {
    setText(next);
    const timestamp = editPlacedTime(next, anchor.current);
    setInvalid(timestamp === null);
    emitted.current = timestamp ?? '';
    onChange(emitted.current);
  };
  return <View style={{ gap: 6 }}>
    <FormField label="Placed time (Eastern Time)" value={text} onChangeText={update} editable={editable}
      placeholder="3:15 PM" autoCapitalize="characters" autoCorrect={false}
      onBlur={() => { if (!invalid && emitted.current) setText(formatPlacedTime(emitted.current)); }} />
    {invalid && <Text style={commonStyles.muted}>Enter a valid Eastern time, such as 3:15 PM or 15:15.</Text>}
  </View>;
}
