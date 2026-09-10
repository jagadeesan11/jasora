import type { Metadata } from 'next';
import './globals.css';

// The same typefaces, from the `geist` package rather than next/font/google.
//
// next/font/google downloads the font at BUILD time and self-hosts the result,
// so a momentary network failure does not error the build — it silently falls
// back to a system face and warns. A production build that quietly ships the
// wrong typeface is not something anyone notices, so the build should not
// depend on the network at all. These files ship in node_modules.
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';

import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'Jasora Admin',
  description: 'Admin panel for managing categories, services, bookings, and technicians.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // suppressHydrationWarning is required by next-themes: it sets the theme
    // class on <html> in a pre-hydration script, which the server render
    // cannot know about.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
