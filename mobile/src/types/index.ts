export type ID = string;

export type PricingType = 'fixed' | 'tiered' | 'per_unit';

export interface InputTemplateField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select';
  required: boolean;
  options?: string[];
  /** Shown under the label, for what the shop wants in the box. */
  hint?: string;
}

export interface InputTemplate {
  id: ID;
  name: string;
  fields: InputTemplateField[];
}

export interface Category {
  id: ID;
  name: string;
  slug: string;
  icon: string | null;
  input_template_id: ID | null;
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

export interface ServiceWithPricing extends Service {
  pricing_rules: PricingRule[];
  addons: Addon[];
}
