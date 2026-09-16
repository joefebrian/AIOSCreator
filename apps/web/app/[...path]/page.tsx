import { notFound } from "next/navigation";
import { EmptyState, Page } from "@/components/ui";
import { IA } from "@/lib/ia";

export default async function IaPage({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const href = "/" + path.join("/");
  const spec = IA[href];
  if (!spec) notFound();
  return (
    <Page kicker="KERANGKA · NOT WIRED" title={spec.title} description={spec.note}>
      <EmptyState
        title="This page is in the IA, not live yet"
        body="It exists because PRD v2.1 says so. No fake LIVE badge until a job backs it."
      />
    </Page>
  );
}
