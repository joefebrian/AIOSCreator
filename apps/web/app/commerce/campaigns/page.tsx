import Link from "next/link";
import { EmptyState, Page } from "@/components/ui";

export default function CampaignsPage() {
  return (
    <Page
      kicker="COMMERCE · CAMPAIGNS"
      title="Campaigns"
      description="A campaign is SKU + character + stills + clips. Build it from the product catalog and a character workspace."
    >
      <EmptyState
        title="Start from a SKU"
        body="Import or create a product, then Affiliate video on a locked character. This board will list those packs later."
        action={
          <Link href="/commerce/products" className="text-[13px] font-semibold text-[#7C6CFF]">
            Product catalog →
          </Link>
        }
      />
    </Page>
  );
}
