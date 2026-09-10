export type ID = string;

export type UserRole = 'customer' | 'technician' | 'admin' | 'shop_owner';

export interface AppUser {
  id: ID;
  name: string | null;
  /** Contact number on the profile, not necessarily the sign-in identity. */
  phone: string | null;
  /** Contact address the customer typed in — NOT the login email. */
  email: string | null;
  role: UserRole;
  created_at: string;
}

/** A profile joined with the identity the person actually signs in with. */
export interface AppUserWithLogin extends AppUser {
  login_email: string | null;
  login_phone: string | null;
}

export type PricingType = 'fixed' | 'tiered' | 'per_unit';

export interface Category {
  id: ID;
  /** The owning shop. NOT NULL since the multi-tenancy migration. */
  shop_id: ID;
  name: string;
  slug: string;
  icon: string | null;
  input_template_id: ID | null;
}

export interface CategoryWithTemplate extends Category {
  input_templates: Pick<InputTemplate, 'id' | 'name' | 'fields'> | null;
}

export type InputFieldType = 'text' | 'number' | 'select';

export interface InputTemplateField {
  name: string;
  label: string;
  type: InputFieldType;
  required: boolean;
  options?: string[];
  /** Shown under the label in the app, for what the shop wants in the box. */
  hint?: string;
}

export interface InputTemplate {
  id: ID;
  name: string;
  fields: InputTemplateField[];
}

export interface Service {
  id: ID;
  category_id: ID;
  name: string;
  description: string | null;
  images: string[];
  base_price: number;
  pricing_type: PricingType;
  duration_minutes: number | null;
  is_active: boolean;
  attributes: Record<string, unknown>;
  /** Key into the bundled icon set; null renders a lettered fallback. */
  icon: string | null;
  created_at: string;
}

export interface ServiceWithCategory extends Service {
  categories: Pick<Category, 'id' | 'name'> | null;
}

export interface PricingRule {
  id: ID;
  service_id: ID;
  condition: Record<string, string>;
  price: number;
}

export interface Addon {
  id: ID;
  service_id: ID;
  name: string;
  price: number;
  is_multi_select: boolean;
}

export type TechnicianStatus = 'active' | 'inactive';

export interface Technician {
  id: ID;
  shop_id: ID;
  profile_id: ID | null;
  name: string;
  phone: string | null;
  category_ids: ID[];
  status: TechnicianStatus;
}

/**
 * One shop's public face — the columns the admin edits under Settings.
 *
 * Replaces the AppSettings singleton, whose whole design was that there could
 * only ever be one shop. The shop_ prefixes are gone with it: a column on
 * shops does not need to say which shop it belongs to.
 */
export interface ShopSettings {
  id: ID;
  slug: string;
  name: string;
  logo_url: string | null;
  support_email: string | null;
  support_phone: string | null;
  address_line: string | null;
  city: string | null;
  postal_code: string | null;
  cod_enabled: boolean;
  online_payment_enabled: boolean;
  privacy_url: string | null;
  instagram_url: string | null;
  whatsapp_number: string | null;
  terms_url: string | null;
  is_active: boolean;
  updated_at: string;
}

export type PaymentMethod = 'online' | 'cod' | 'offline';

export type BookingStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface BookingCustomer {
  name: string | null;
  phone: string | null;
  email: string | null;
  address_line: string | null;
  city: string | null;
  postal_code: string | null;
}

export interface BookingListItem {
  id: ID;
  scheduled_at: string;
  status: BookingStatus;
  total_price: number;
  discount_amount: number;
  discount_reason: string | null;
  promo_discount_amount: number;
  /** to-one on a plain FK: PostgREST returns an object, or null when no code. */
  promo_codes: { code: string } | null;
  /** Generated: total_price - discount_amount - promo_discount_amount. Read-only. */
  net_price: number;
  technician_id: ID | null;
  addon_ids: ID[];
  created_at: string;
  contact_name: string | null;
  contact_phone: string | null;
  service_address: string | null;
  service_city: string | null;
  service_postal_code: string | null;
  needs_pickup: boolean;
  pickup_notes: string | null;
  payment_method: PaymentMethod;
  /** to-MANY: a booking can have several payment attempts, so this is an array. */
  payments: { status: string }[] | null;
  /** to-one: booking_id is UNIQUE on invoices, so this is an object or null. */
  invoices: { number: string } | { number: string }[] | null;
  services: { id: ID; name: string; category_id: ID; duration_minutes: number | null } | null;
  profiles: BookingCustomer | null;
  technicians: { id: ID; name: string; phone: string | null } | null;
  /** Whatever the category's input_template collected, e.g. vehicle details. */
  customer_assets: { attributes: Record<string, string> } | null;
}
