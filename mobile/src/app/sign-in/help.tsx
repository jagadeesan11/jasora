import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AuthScreen } from '@/components/auth-screen';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { Spacing } from '@/constants/theme';
import { useAppSettings } from '@/hooks/use-app-settings';
import { parseIdentifier } from '@/lib/auth-identifier';
import { supabase } from '@/lib/supabase';

/**
 * "Trouble signing in?" — a request an admin picks up, rather than a
 * self-service reset.
 *
 * Self-service needs a mail sender the project doesn't have. This needs
 * nothing: the customer leaves a contact, someone recognises the account and
 * sets a password. It doubles as the general question box, so a customer who
 * can't get in has somewhere to say why.
 */
export default function SignInHelpScreen() {
  const { settings, shopId } = useAppSettings();
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    const parsed = parseIdentifier(contact);
    if (parsed.kind === 'invalid') {
      setError('Enter the phone number or email address on your account.');
      return;
    }

    if (!shopId) {
      // Still resolving, or no shop is configured at all. Saying so beats the
      // constraint violation the insert would otherwise return verbatim.
      setError('Still loading. Try again in a moment.');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    // Deliberately no .select(): the row is not readable by the person who
    // wrote it. INSERT ... RETURNING would apply the SELECT policy and be
    // refused — and the queue must stay unreadable, or it becomes a way to
    // find out who has an account.
    const { error: insertError } = await supabase.from('support_requests').insert({
      // Which shop the request is for. There is no session yet and no parent
      // row to derive it from, so it is sent explicitly.
      shop_id: shopId,
      kind: 'password_reset',
      contact_raw: contact.trim(),
      contact_email: parsed.kind === 'email' ? parsed.email : null,
      contact_phone: parsed.kind === 'phone' ? parsed.phone : null,
      message: message.trim() || null,
    });
    setIsSubmitting(false);

    if (insertError) {
      // The flood guard speaks in plain English already, so it is shown as-is.
      setError(insertError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthScreen
        title="Request received"
        subtitle={`Thanks — we'll get in touch on ${contact.trim()} and get you back in. ${settings.shop_name} usually replies the same day.`}
      >
        <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Trouble signing in?"
      subtitle="Leave the phone number or email on your account and we'll sort it out for you."
    >
      <TextField
        label="Phone or email"
        value={contact}
        onChangeText={(text) => {
          setContact(text);
          if (error) setError(null);
        }}
        placeholder="98765 43210 or you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
      />

      <TextField
        label="Anything else? (optional)"
        value={message}
        onChangeText={setMessage}
        placeholder="Tell us what happened"
        multiline
        numberOfLines={4}
        maxLength={1000}
        style={styles.multiline}
      />

      {error && (
        <ThemedText type="small" themeColor="error">
          {error}
        </ThemedText>
      )}

      <Button label="Send request" loading={isSubmitting} onPress={handleSubmit} />

      <View style={styles.footer}>
        <Pressable onPress={() => router.back()} accessibilityRole="link" hitSlop={8}>
          <ThemedText type="small" themeColor="primary">
            Back to sign in
          </ThemedText>
        </Pressable>
      </View>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  footer: { alignItems: 'center', marginTop: Spacing.one },
});
