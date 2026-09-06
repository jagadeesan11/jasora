import { PageHeader } from '@/components/page-header';
import { ShopForm } from '@/components/shops/shop-form';

export default function NewShopPage() {
  return (
    <div>
      <PageHeader
        title="New shop"
        description="A shop gets its own catalogue, staff, opening hours and invoice numbering. Nothing is shared with the others."
      />
      <ShopForm />
    </div>
  );
}
