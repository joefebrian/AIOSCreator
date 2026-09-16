import { EmptyState, Page } from "@/components/ui";

export function Parked({ name, note }: { name: string; note: string }) {
  return (
    <Page kicker="MODULE · OFF" title={name} description={note}>
      <EmptyState
        title="Not wired yet"
        body="HOME will not light this module until a completed job exists. No fake LIVE badge."
      />
    </Page>
  );
}
