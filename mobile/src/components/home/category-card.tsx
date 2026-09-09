import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ServiceIcon } from '@/components/service-icon';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui/card';
import { SERVICE_ICONS } from '@/constants/service-icons';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Category } from '@/types';

/**
 * One category in a shop's catalogue.
 *
 * Lifted out of the home screen when home became the list of shops: categories
 * belong to a shop now, so this is rendered on the shop page rather than the
 * one above it.
 */
export function CategoryCard({ category }: { category: Category }) {
  const theme = useTheme();

  return (
    <Card
      onPress={() =>
        router.push({
          pathname: '/(app)/home/[categoryId]',
          params: { categoryId: category.id, categoryName: category.name },
        })
      }
      style={styles.card}
    >
      {/* The category's icon when one is set, and a tinted initial when it is
          not — so a brand-new vertical looks intentional rather than broken
          before anyone has picked artwork for it. */}
      <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
        {SERVICE_ICONS[category.icon ?? ''] ? (
          <ServiceIcon name={category.icon} size={26} />
        ) : (
          <ThemedText type="heading" style={{ color: theme.primary }}>
            {category.name.charAt(0).toUpperCase()}
          </ThemedText>
        )}
      </View>

      <View style={styles.body}>
        <ThemedText type="bodyMedium">{category.name}</ThemedText>
        <ThemedText type="small" themeColor="textMuted">
          Browse services
        </ThemedText>
      </View>

      <ThemedText type="body" themeColor="textMuted">
        ›
      </ThemedText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginHorizontal: Spacing.four,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 1 },
});
