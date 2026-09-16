import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "mt-1 w-full rounded-xl border border-[#E6E8EE] bg-white px-3 py-2 text-sm outline-none transition placeholder:text-[#9CA3AF] focus:border-[#652DFF] focus:ring-2 focus:ring-[#652DFF]/15";

export function Page({
  kicker,
  title,
  description,
  actions,
  children,
}: {
  kicker: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#652DFF]">{kicker}</p>
          <h1 className="mt-1 text-2xl font-black tracking-tight">{title}</h1>
          {description ? <div className="mt-2 text-sm leading-relaxed text-[#4B5563]">{description}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function Surface({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border border-[#E6E8EE] bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.03)]", className)}>
      {children}
    </div>
  );
}

export function Btn({
  children,
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center rounded-xl px-3.5 py-2 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-[#652DFF] text-white hover:bg-[#5725e0]",
        variant === "ghost" && "border border-[#E6E8EE] bg-white text-[#0B0F2B] hover:border-[#652DFF]/40",
        variant === "danger" && "text-red-600 hover:bg-red-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <Surface className="px-6 py-10 text-center">
      <p className="text-sm font-semibold">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-[#6B7280]">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </Surface>
  );
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "on" | "ready" | "warn" | "off";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
        tone === "muted" && "bg-[#F3F4F8] text-[#6B7280]",
        tone === "on" && "bg-[#652DFF] text-white",
        tone === "ready" && "bg-[#ECFDF3] text-[#15803D]",
        tone === "warn" && "bg-[#FFF7ED] text-[#C2410C]",
        tone === "off" && "bg-[#FEF2F2] text-[#B91C1C]",
      )}
    >
      {children}
    </span>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-[#652DFF] hover:underline">
      {children}
    </Link>
  );
}
