"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { BrandLogo } from "@/components/BrandLogo";
import { GpuHeader, GpuProvider } from "@/components/GpuStatus";
import { Inspector } from "@/components/Inspector";
import { Menu, PanelLeft, PanelLeftClose } from "lucide-react";

const NAV_HIDDEN_KEY = "creatoros.navHidden";

function readNavHidden() {
  try {
    return window.localStorage.getItem(NAV_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

const GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  { label: "", items: [{ href: "/", label: "Home" }] },
  {
    label: "Intelligence",
    items: [
      { href: "/intelligence/research", label: "Research" },
      { href: "/intelligence/trends", label: "Trends" },
      { href: "/intelligence/opportunities", label: "Opportunities" },
    ],
  },
  {
    label: "Commerce",
    items: [
      { href: "/commerce/products", label: "Products" },
      { href: "/commerce/programs", label: "Affiliate Programs" },
      { href: "/commerce/campaigns", label: "Campaigns" },
    ],
  },
  {
    label: "Create",
    items: [
      { href: "/create/studio", label: "AI Studio" },
      { href: "/create/ugc-factory", label: "Faceless VO" },
      { href: "/create/motion", label: "MotionControl" },
      { href: "/create/characters", label: "Characters" },
      { href: "/create/motion-library", label: "Motion Library" },
      { href: "/create/assets", label: "Assets" },
      { href: "/create/short-drama", label: "ShortDrama" },
    ],
  },
  {
    label: "Distribute",
    items: [
      { href: "/distribute/calendar", label: "Calendar" },
      { href: "/distribute/queue", label: "Publish Queue" },
      { href: "/distribute/accounts", label: "Accounts" },
    ],
  },
  {
    label: "Grow",
    items: [
      { href: "/grow/engagement", label: "Engagement" },
      { href: "/grow/analytics", label: "Analytics" },
      { href: "/grow/revenue", label: "Revenue" },
      { href: "/grow/engine", label: "Growth Engine" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/system/workflows", label: "Workflows" },
      { href: "/system/usage", label: "Usage" },
      { href: "/system/models", label: "Models" },
      { href: "/system/comfyui", label: "ComfyUI" },
      { href: "/system/rights", label: "Identity Rights" },
      { href: "/system/settings", label: "Settings" },
    ],
  },
];

function desktopNav() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
}

function navActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

function NavLinks({
  path,
  studio,
  onClick,
}: {
  path: string;
  studio: boolean;
  onClick?: () => void;
}) {
  return (
    <>
      {GROUPS.map((group) => (
        <div key={group.label || "home"} className="mb-5">
          {group.label ? (
            <p className="mb-1.5 px-2.5 text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF] uppercase">
              {group.label}
            </p>
          ) : null}
          {group.items.map((item) => {
            const active = navActive(path, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClick}
                className={cn(
                  "mb-0.5 flex items-center rounded-lg px-2.5 py-1.5 text-[13px] transition",
                  studio
                    ? active
                      ? "bg-white/10 font-semibold text-white"
                      : "text-white/55 hover:bg-white/5 hover:text-white"
                    : active
                      ? "bg-[#7C6CFF]/10 font-semibold text-[#7C6CFF]"
                      : "text-[#374151] hover:bg-[#F3F4F8]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const studio = path.startsWith("/create/studio");
  const characterWorkspace = /^\/create\/characters\/(?!new$)[^/]+/.test(path);
  const [menu, setMenu] = useState(false);
  const [navHidden, setNavHidden] = useState(false);

  useEffect(() => {
    setNavHidden(readNavHidden());
  }, []);

  function toggleNav() {
    if (desktopNav()) {
      setNavHidden((v) => {
        const next = !v;
        window.localStorage.setItem(NAV_HIDDEN_KEY, next ? "1" : "0");
        return next;
      });
    } else setMenu((v) => !v);
  }

  return (
    <GpuProvider>
    <div className={cn("min-h-screen", studio ? "bg-[#0e1014] text-white" : "bg-[#F3F4F8] text-[#0B0F2B]")}>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/10 bg-[#070B1A] px-4 py-2 md:px-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-transparent text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-expanded={menu || !navHidden}
            aria-controls="app-nav"
            aria-label={desktopNav() ? (navHidden ? "Show sidebar" : "Hide sidebar") : "Open menu"}
            title={desktopNav() ? (navHidden ? "Show sidebar" : "Hide sidebar") : "Menu"}
            onClick={toggleNav}
          >
            <span className="md:hidden">
              <Menu size={18} strokeWidth={2} />
            </span>
            <span className="hidden md:inline">
              {navHidden ? <PanelLeft size={18} strokeWidth={2} /> : <PanelLeftClose size={18} strokeWidth={2} />}
            </span>
          </button>
          <Link href="/" className="flex items-center" aria-label="AIOS Creator home">
            <BrandLogo />
          </Link>
        </div>
        <GpuHeader />
      </header>
      {menu ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setMenu(false)} />
          <div
            className={cn(
              "relative h-full w-[min(82vw,18.5rem)] overflow-y-auto px-3 py-5 shadow-xl",
              studio ? "bg-[#12151c]" : "bg-white",
            )}
          >
            <NavLinks path={path} studio={studio} onClick={() => setMenu(false)} />
          </div>
        </div>
      ) : null}
      <div className="flex min-h-[calc(100vh-49px)]">
        <nav
          id="app-nav"
          className={cn(
            "hidden w-[232px] shrink-0 overflow-y-auto border-r px-3 py-5 md:block",
            navHidden && "md:hidden",
            studio ? "border-white/10 bg-[#12151c]" : "border-[#E6E8EE] bg-white",
          )}
        >
          <NavLinks path={path} studio={studio} />
        </nav>
        <main className={cn("min-w-0 flex-1", studio ? "overflow-hidden bg-[#0e1014]" : "overflow-y-auto bg-[#F3F4F8]")}>
          {children}
        </main>
        {studio || characterWorkspace ? null : (
          <div className="hidden shrink-0 xl:block">
            <Inspector />
          </div>
        )}
      </div>
    </div>
    </GpuProvider>
  );
}
