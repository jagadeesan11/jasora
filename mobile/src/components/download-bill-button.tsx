import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { invoiceFileName, invoiceHtml, PAGE, type PdfInvoice } from '@/lib/invoice-pdf';

/**
 * Prints the bill into its own hidden frame.
 *
 * expo-print's web build does not print what you give it. Its entire
 * implementation is `window.print()` for both print() and printToFileAsync(),
 * with the `html` argument dropped on the floor — so asking it to print a bill
 * printed whatever page the customer happened to be looking at, booking list
 * and all.
 *
 * Rendering into an iframe and printing that frame is what actually scopes the
 * output to the document. The frame is removed after the dialog closes;
 * `onafterprint` covers the normal path and the timeout covers browsers that
 * never fire it.
 */
function printHtmlOnWeb(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(frame);

  const remove = () => frame.remove();

  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) {
      remove();
      return;
    }
    view.onafterprint = remove;
    view.focus();
    view.print();
    // Belt and braces: Safari and some mobile browsers never fire onafterprint.
    setTimeout(remove, 60_000);
  };

  // srcdoc rather than document.write, which is deprecated and refused by
  // strict document policies.
  frame.srcdoc = html;
}

/**
 * Turns the bill into a PDF the customer or the shop can keep.
 *
 * Two different jobs behind one button, because the platforms genuinely differ:
 *
 *  - On a phone, the PDF is written to a file and handed to the share sheet,
 *    which is where "Save to Files", "Drive" and "send on WhatsApp" all live.
 *  - On web there is no file to hand anywhere, so the browser's own print
 *    dialog is the download, via its "Save as PDF".
 */
export function DownloadBillButton({
  invoice,
  variant = 'outline',
}: {
  invoice: PdfInvoice;
  /** `outline` sits inside a card; `link` sits in a row of text actions. */
  variant?: 'outline' | 'link';
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function download() {
    if (busy) return;
    setBusy(true);
    setProblem(null);

    try {
      const html = invoiceHtml(invoice);

      if (Platform.OS === 'web') {
        printHtmlOnWeb(html);
        return;
      }

      const { uri } = await Print.printToFileAsync({
        html,
        width: PAGE.width,
        height: PAGE.height,
      });

      // The generated file gets a random name, and this is a document people
      // file and search for later, so it is worth giving it a real one.
      //
      // Copied rather than moved, and awaited. `move()` is asynchronous: firing
      // it and reading `.uri` on the next line handed the share sheet a path
      // the file had not arrived at yet, which surfaced as ENOENT. Copying also
      // leaves the original in place, so if anything here fails there is still
      // a file to share — the rename is a nicety and must never cost the PDF.
      let file = uri;
      try {
        const { File, Paths } = await import('expo-file-system');
        const target = new File(Paths.cache, invoiceFileName(invoice.number));
        if (target.exists) target.delete();
        await new File(uri).copy(target);
        // Only switch once the copy is actually on disk.
        if (target.exists) file = target.uri;
      } catch {
        /* keep the generated name */
      }

      if (!(await Sharing.isAvailableAsync())) {
        setProblem('Sharing is not available on this device.');
        return;
      }

      await Sharing.shareAsync(file, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: `Bill ${invoice.number}`,
      });
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not make the PDF.');
    } finally {
      setBusy(false);
    }
  }

  const label = busy ? 'Preparing…' : 'Download PDF';

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => void download()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`Download bill ${invoice.number} as a PDF`}
        accessibilityState={{ disabled: busy, busy }}
        style={({ pressed }) => [
          variant === 'outline' ? styles.outline : styles.link,
          variant === 'outline' && { borderColor: theme.border },
          pressed && { opacity: 0.7 },
        ]}
      >
        {busy && <ActivityIndicator size="small" color={theme.primary} />}
        <ThemedText type="smallBold" themeColor="primary">
          {label}
        </ThemedText>
      </Pressable>

      {problem && (
        <ThemedText type="caption" themeColor="error">
          {problem}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  outline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.sm,
    paddingVertical: Spacing.three,
  },
  link: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
