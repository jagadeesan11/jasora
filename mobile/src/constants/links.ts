/**
 * Outward-facing contact and legal links.
 *
 * SUPPORT_EMAIL and SUPPORT_PHONE are only the offline fallback now — the live
 * values come from `app_settings` via useAppSettings(), so support contacts can
 * change from the admin panel without a store release. Screens should read the
 * hook; these are what renders before the first response arrives.
 *
 * The legal document URLs used to live here. They now come from app_settings
 * (privacy_url / terms_url) so they can be published without a release --
 * see useAppSettings(). The screens still show an honest "not published yet"
 * state while those are null, rather than inventing legal copy.
 */
export const SUPPORT_EMAIL = 'support@jasora.app';
export const SUPPORT_PHONE = '+91 00000 00000';

export const FAQ: { question: string; answer: string }[] = [
  {
    question: 'How do I book a service?',
    answer:
      'Pick a category on the Home tab, choose a service, add any extras you want, then tell us about your vehicle and pick a time slot.',
  },
  {
    question: 'When am I charged?',
    answer:
      'Payment is taken when you confirm the booking. Until it completes, your booking stays as pending payment and the slot is not held.',
  },
  {
    question: 'Can I change or cancel a booking?',
    answer:
      'Get in touch using the contact options above and we will reschedule or cancel it for you.',
  },
  {
    question: 'How will I know a technician is assigned?',
    answer:
      'You will get a push notification as soon as a technician is assigned, and the booking status updates in the Bookings tab.',
  },
];
