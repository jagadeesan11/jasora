import { router } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  ChatIcon,
  HelpIcon,
  InstagramIcon,
  PhoneIcon,
} from '@/components/home/action-icons';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useTheme } from '@/hooks/use-theme';
import { instagramHandle, whatsappUrl } from '@/lib/social-links';

type Action = {
  key: string;
  label: string;
  Icon: (props: { size?: number; color: string }) => React.ReactElement;
  onPress: () => void;
};

const TILE_WIDTH = 84;

/**
 * How to reach a shop: WhatsApp, phone, Instagram, and the help centre.
 *
 * Lives on the shop page rather than home. These are a shop's own channels —
 * on a home screen listing every shop they belonged to none of them, and
 * quietly showed whichever shop happened to be selected.
 *
 * Which contact channels appear depends on what the shop has configured, so
 * the row never offers a WhatsApp — or an Instagram — that goes nowhere.
 *
 * A fixed-width row used to cap this at three, which silently dropped
 * whichever channel lost the coin toss once WhatsApp, Call and Instagram were
 * all configured at once. Scrolling horizontally instead means adding a
 * channel is never a trade against another one.
 */
export function QuickActions({ shopId }: { shopId?: string | null } = {}) {
  const theme = useTheme();
  const { settings } = useAppSettings(shopId);

  const whatsapp = whatsappUrl(settings.whatsapp_number);
  const instagram = instagramHandle(settings.instagram_url);

  // No "My bookings" tile: Bookings is already one of the three tabs along the
  // bottom, and a shortcut to a tab teaches people the tab is somewhere else.
  const actions: Action[] = [
    ...(whatsapp
      ? [
          {
            key: 'whatsapp',
            label: 'WhatsApp',
            Icon: ChatIcon,
            onPress: () => Linking.openURL(whatsapp),
          },
        ]
      : []),
    ...(settings.support_phone
      ? [
          {
            key: 'call',
            label: 'Call us',
            Icon: PhoneIcon,
            onPress: () => Linking.openURL(`tel:${settings.support_phone!.replace(/\s/g, '')}`),
          },
        ]
      : []),
    ...(instagram && settings.instagram_url
      ? [
          {
            key: 'instagram',
            label: instagram,
            Icon: InstagramIcon,
            onPress: () => Linking.openURL(settings.instagram_url!),
          },
        ]
      : []),
    {
      key: 'help',
      label: 'Help',
      Icon: HelpIcon,
      onPress: () => router.push('/settings/help'),
    },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {actions.map(({ key, label, Icon, onPress }) => (
        <Pressable
          key={key}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed }) => [
            styles.tile,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
        >
          <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
            <Icon size={19} color={theme.primary} />
          </View>
          <ThemedText type="caption" numberOfLines={1}>
            {label}
          </ThemedText>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
  tile: {
    width: TILE_WIDTH,
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
