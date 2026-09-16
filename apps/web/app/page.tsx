import Link from "next/link";
import { EmptyState, Page, Pill, Surface } from "@/components/ui";
import { listJobs } from "@/lib/store";

export const dynamic = "force-dynamic";

const LOOP = ["Research", "Create", "Animate", "Publish", "Engage", "Measure", "Monetize", "Learn"];

export default function HomePage() {
  const jobs = listJobs().slice(0, 8);
  const scripts = jobs.filter((j) => j.kind === "script" && j.status === "completed").length;
  return (
    <Page
      kicker="HOME"
      title="AI Creator Commerce OS"
      description="Local-first OS: MotionControl, Helios studio, UGC affiliate, official distribution. North star is attributable revenue, not pretty frames."
    >
      <div className="flex flex-wrap gap-1.5">
        {LOOP.map((step, i) => (
          <span
            key={step}
            className="rounded-full border border-[#E6E8EE] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#4B5563]"
          >
            {i + 1} {step}
          </span>
        ))}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <StartCard
          href="/intelligence/research"
          kicker="Intelligence"
          title="Research · image/video to prompt"
          body="Drop a still or clip. Qwen VL writes a photoreal prompt. Copy into Characters or I2V."
        />
        <StartCard
          href="/commerce/products"
          kicker="Killer journey"
          title="Paste Amazon URL"
          body="Product object first. Script and UGC hang off Commerce, not a fake social-OS home."
        />
        <StartCard
          href="/create/ugc-factory"
          kicker="Usable now"
          title="UGC Factory · script"
          body={`${scripts} completed script${scripts === 1 ? "" : "s"}. Voice/render later.`}
        />
        <StartCard
          href="/create/characters"
          kicker="Create"
          title="Characters"
          body="Lock a face, GEN the sheet. Qwen keep-face on this 3060."
        />
        <StartCard
          href="/create/motion"
          kicker="Create"
          title="MotionControl"
          body="Still → clip. Local H3 or Seedance cloud if keyed."
        />
      </div>

      <h2 className="mt-10 text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">JOB QUEUE</h2>
      {jobs.length === 0 ? (
        <div className="mt-2">
          <EmptyState title="No jobs yet" body="Start from Products, Characters, or MotionControl." />
        </div>
      ) : (
        <ul className="mt-2 overflow-hidden rounded-2xl border border-[#E6E8EE] bg-white">
          {jobs.map((job) => (
            <li
              key={job.id}
              className="flex items-center justify-between gap-3 border-b border-[#E6E8EE] px-4 py-3 text-sm last:border-b-0"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Pill tone={job.status === "completed" ? "ready" : job.status === "failed" ? "off" : "warn"}>
                  {job.status}
                </Pill>
                <span className="truncate">{job.script?.title || job.input}</span>
              </span>
              <span className="shrink-0 text-[11px] text-[#9CA3AF]">{job.kind}</span>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

function StartCard({
  href,
  kicker,
  title,
  body,
}: {
  href: string;
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <Link href={href}>
      <Surface className="h-full transition hover:border-[#652DFF]/50">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-[#652DFF]">{kicker.toUpperCase()}</p>
        <p className="mt-1 font-bold">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#6B7280]">{body}</p>
      </Surface>
    </Link>
  );
}
