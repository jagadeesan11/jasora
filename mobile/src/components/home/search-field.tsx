import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Searching the whole platform from home.
 *
 * Controlled by the screen rather than holding its own text, because the same
 * value decides whether the list below shows results or the catalogue — two
 * copies of that would drift for a frame on every keystroke.
 */
export function SearchField({
  value,
  onChange,
  placeholder = 'Search shops and services',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.field, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <ThemedText type="body" themeColor="textMuted">
          ⌕
        </ThemedText>

        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { color: theme.text }]}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          // The results appear as you type, so the keyboard's own submit has
          // nothing left to do — but dismissing it reveals more of them.
          clearButtonMode="never"
          accessibilityLabel="Search shops and services"
        />

        {value.length > 0 ? (
          <Pressable
            onPress={() => onChange('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
          >
            <ThemedText type="body" themeColor="textMuted">
              ✕
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    height: 44,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
});
