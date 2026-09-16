import Link from "next/link";
import { EmptyState, Page } from "@/components/ui";

export default function ProgramsPage() {
  return (
    <Page
      kicker="COMMERCE · PROGRAMS"
      title="Affiliate programs"
      description="Amazon Associates is live on Products (tag on import). Other networks stay here when you add keys."
    >
      <EmptyState
        title="Amazon first"
        body="Set your associate tag on Products. Shopee / TikTok Shop affiliate IDs are not wired yet — import the listing URL and keep the original link."
        action={
          <Link href="/commerce/products" className="text-[13px] font-semibold text-[#7C6CFF]">
            Open product catalog →
          </Link>
        }
      />
    </Page>
  );
}
