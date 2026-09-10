import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { InputTemplateField } from '@/types';

interface DynamicFormProps {
  fields: InputTemplateField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}

/**
 * A select this long opens a searchable sheet instead of chips.
 *
 * Vehicle makes are what forced a number: thirty-odd chips wrap into a wall
 * that fills the screen and has to be read end to end to find one name, while
 * four fuel types read at a glance.
 */
const SHEET_FROM = 8;

// Renders whatever fields a category's input_template declares (text/number/
// select), so collecting Car Care's vehicle info vs. a future vertical's
// address+room-count needs zero new screens — only new input_templates rows.
export function DynamicForm({ fields, values, onChange }: DynamicFormProps) {
  return (
    <View style={styles.container}>
      {fields.map((field) => (
        <FormField key={field.name} field={field} value={values[field.name] ?? ''} onChange={onChange} />
      ))}
    </View>
  );
}

function FormField({
  field,
  value,
  onChange,
}: {
  field: InputTemplateField;
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  const theme = useTheme();
  const options = field.options ?? [];

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">
        {field.label}
        {field.required && <ThemedText themeColor="error"> *</ThemedText>}
      </ThemedText>

      {/* What the shop actually wants in the box. Without it, "Vehicle Model"
          collects the variant, the year and the trim as well. */}
      {field.hint ? (
        <ThemedText type="small" themeColor="textMuted">
          {field.hint}
        </ThemedText>
      ) : null}

      {field.type === 'select' ? (
        options.length >= SHEET_FROM ? (
          <OptionSheet field={field} options={options} value={value} onChange={onChange} />
        ) : (
          <View style={styles.chipRow}>
            {options.map((option) => {
              const isSelected = value === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => onChange(field.name, option)}
                  style={[
                    styles.chip,
                    { borderColor: theme.border },
                    isSelected && { backgroundColor: theme.primary, borderColor: theme.primary },
                  ]}
                >
                  <ThemedText
                    type="small"
                    themeColor={isSelected ? 'primaryText' : 'text'}
                    style={styles.chipLabel}
                  >
                    {option}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        )
      ) : (
        <TextInput
          value={value}
          onChangeText={(text) => onChange(field.name, text)}
          keyboardType={field.type === 'number' ? 'numeric' : 'default'}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
        />
      )}
    </View>
  );
}

/**
 * One value out of a long list: a field that opens a sheet you can type into.
 *
 * The search runs over the predefined options only. Nothing here lets a
 * customer enter their own — a list exists so that two people with the same car
 * do not write it down two ways, and a free-text escape hatch puts that
 * straight back. A list that needs one carries an explicit "Other" option.
 */
function OptionSheet({
  field,
  options,
  value,
  onChange,
}: {
  field: InputTemplateField;
  options: string[];
  value: string;
  onChange: (name: string, value: string) => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');

  const matches = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((option) => option.toLowerCase().includes(needle));
  }, [options, term]);

  function close() {
    setOpen(false);
    setTerm('');
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={value ? `${field.label}: ${value}` : `Choose ${field.label}`}
        style={[styles.input, styles.trigger, { borderColor: theme.border }]}
      >
        <ThemedText themeColor={value ? 'text' : 'textSecondary'} numberOfLines={1}>
          {value || `Choose ${field.label.toLowerCase()}`}
        </ThemedText>
        <ThemedText themeColor="textMuted">▾</ThemedText>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={close}>
        <View style={styles.backdrop}>
          {/* Tapping away closes, which is what every other sheet on the phone
              does. The sheet sits above this and keeps its own taps. */}
          <Pressable style={styles.backdropFill} onPress={close} />

          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <SafeAreaView edges={['bottom']}>
              <View style={styles.sheetHead}>
                <ThemedText type="bodyMedium">{field.label}</ThemedText>
                <Pressable onPress={close} hitSlop={8}>
                  <ThemedText type="small" themeColor="primary">
                    Close
                  </ThemedText>
                </Pressable>
              </View>

              <TextInput
                value={term}
                onChangeText={setTerm}
                autoFocus
                autoCorrect={false}
                placeholder="Search"
                placeholderTextColor={theme.textSecondary}
                style={[styles.input, styles.search, { color: theme.text, borderColor: theme.border }]}
              />

              <FlatList
                data={matches}
                keyExtractor={(option) => option}
                // The search box still holds focus when the list is tapped, and
                // the default spends that first tap dismissing the keyboard.
                keyboardShouldPersistTaps="handled"
                style={styles.sheetList}
                ListEmptyComponent={
                  <ThemedText type="small" themeColor="textMuted" style={styles.empty}>
                    Nothing matches that.
                  </ThemedText>
                }
                renderItem={({ item }) => {
                  const isSelected = item === value;
                  return (
                    <Pressable
                      onPress={() => {
                        onChange(field.name, item);
                        close();
                      }}
                      style={[styles.row, { borderBottomColor: theme.border }]}
                    >
                      <ThemedText themeColor={isSelected ? 'primary' : 'text'}>{item}</ThemedText>
                      {isSelected ? <ThemedText themeColor="primary">✓</ThemedText> : null}
                    </Pressable>
                  );
                }}
              />
            </SafeAreaView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    // The height a TextInput settles at, so a form of both does not step up
    // and down the screen.
    minHeight: 44,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderRadius: Spacing.five,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  chipLabel: {
    textTransform: 'capitalize',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backdropFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  sheet: {
    maxHeight: '75%',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.two,
  },
  search: {
    marginBottom: Spacing.two,
  },
  sheetList: {
    // Bounded so the sheet keeps its shape on a long list and still shrinks to
    // fit a short one.
    maxHeight: 360,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  empty: {
    paddingVertical: Spacing.three,
  },
});
