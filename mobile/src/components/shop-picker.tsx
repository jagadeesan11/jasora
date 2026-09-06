import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShopAvatar } from '@/components/shop-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Radius, Spacing } from '@/constants/theme';
import { useShop } from '@/hooks/use-app-settings';
import { useTheme } from '@/hooks/use-theme';

/**
 * Which shop the customer is booking with.
 *
 * Shown only when there is a real choice nobody has made — one shop resolves
 * on its own, and a remembered choice resolves on its own after that, so most
 * people never see this screen and nobody sees it twice.
 *
 * It stands in front of the tabs rather than living inside them because
 * everything behind it is shop-scoped: the catalogue, the hours, the prices.
 * A home screen rendered before this is answered would be a home screen with
 * nothing in it.
 */
export function ShopPicker({ onChosen }: { onChosen?: () => void } = {}) {
  const theme = useTheme();
  const { options, choose } = useShop();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.intro}>
            <ThemedText type="title">Choose a shop</ThemedText>
            <ThemedText themeColor="textMuted">
              You can change this later from your profile.
            </ThemedText>
          </View>

          {options.map((shop) => (
            <Pressable
              key={shop.id}
              onPress={() => {
                void choose(shop.id);
                onChosen?.();
              }}
              accessibilityRole="button"
              accessibilityLabel={shop.name}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            >
              <Card style={styles.card}>
                <ShopAvatar url={shop.logo_url} name={shop.name} size={44} />
                <View style={styles.text}>
                  <ThemedText type="bodyMedium" numberOfLines={1}>
                    {shop.name}
                  </ThemedText>
                  {shop.city ? (
                    <ThemedText themeColor="textMuted" numberOfLines={1}>
                      {shop.city}
                    </ThemedText>
                  ) : null}
                </View>
                <ThemedText themeColor="textMuted" style={{ color: theme.textMuted }}>
                  ›
                </ThemedText>
              </Card>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.two },
  intro: { gap: Spacing.one, marginBottom: Spacing.three },
  row: { borderRadius: Radius.lg },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  text: { flex: 1, gap: 2 },
});
