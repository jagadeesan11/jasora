import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShopAvatar } from '@/components/shop-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { Radius, Spacing } from '@/constants/theme';
import { useMyShop } from '@/hooks/use-my-shop';

/**
 * Which shop the owner app is managing.
 *
 * The customer picker's counterpart, and separate from it on purpose: this one
 * offers only shops the person actually works at, where that one offers every
 * shop open for business. Someone who is both a customer and staff should not
 * have one choice decide the other.
 *
 * Almost nobody sees this. A shop owner belongs to one shop and it resolves on
 * its own; it appears for a platform admin, who administers every shop and is a
 * member of none, and for anyone who genuinely runs two.
 */
export function OwnerShopPicker({ onChosen }: { onChosen?: () => void } = {}) {
  const { options, choose } = useMyShop();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.intro}>
            <ThemedText type="title">Which shop?</ThemedText>
            <ThemedText themeColor="textMuted">
              Jobs, catalogue, team and hours all belong to one shop. You can change this from
              Shop.
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
              </Card>
            </Pressable>
          ))}

          {options.length === 0 ? (
            // Not a choice to make but a state to explain. Membership is what
            // every owner-side permission is written against, so without one
            // there is nothing here to show and nothing this screen can do
            // about it.
            <Card style={styles.empty}>
              <ThemedText type="bodyMedium">You are not on a shop&rsquo;s staff yet</ThemedText>
              <ThemedText themeColor="textMuted">
                Ask whoever runs Nexora to add you to a shop, then sign in again.
              </ThemedText>
            </Card>
          ) : null}
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
  empty: { gap: Spacing.one },
  text: { flex: 1, gap: 2 },
});
