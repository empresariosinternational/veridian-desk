"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useMemo, type ReactNode } from "react";
import ProfileMenu from "@/components/ProfileMenu";
import VeridianMark from "@/components/VeridianMark";
import { VeridianCTA, useVeridian } from "@/components/VeridianContext";
import { IconDesk, IconEvents, IconMic, IconPeople, IconPond, IconSetup, IconToday } from "./Icons";
import TodayDock from "./TodayDock";
import ThemeToggle from "./ThemeToggle";
import { NODE_WORDS, useDeskNode } from "./useDeskNode";

type Item = { label: string; hint?: string; href: string; icon: ReactNode; match: (p: string) => boolean; keepScene: boolean };

const ITEMS: Item[] = [
  { label: "Home", hint: "start here", href: "/", icon: <IconToday />, match: (p) => p === "/", keepScene: true },
  { label: "The Desk", hint: "say it once", href: "/desk", icon: <IconDesk />, match: (p) => p.startsWith("/desk"), keepScene: false },
  { label: "People", hint: "donors, families", href: "/crm", icon: <IconPeople />, match: (p) => p.startsWith("/crm") || p.startsWith("/profile"), keepScene: true },
  { label: "Partners", hint: "local groups", href: "/social-scene", icon: <IconPond />, match: (p) => p.startsWith("/social-scene"), keepScene: true },
  { label: "Events", hint: "around Miami", href: "/events", icon: <IconEvents />, match: (p) => p.startsWith("/events") || p.startsWith("/c/"), keepScene: true },
  { label: "Settings", hint: "your assistant", href: "/setup", icon: <IconSetup />, match: (p) => p.startsWith("/setup"), keepScene: false },
];

/** Keep the Luma scene (?cities=…&follows=…) on every link, like the old header did. */
function useSceneQs(): string {
  const sp = useSearchParams();
  return useMemo(() => {
    const p = new URLSearchParams();
    const cities = sp.get("cities");
    const follows = sp.get("follows");
    if (cities) p.set("cities", cities);
    if (follows) p.set("follows", follows);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [sp]);
}

function SidebarNav({ pathname }: { pathname: string }) {
  const qs = useSceneQs();
  return <NavList pathname={pathname} qs={qs} />;
}

function NavList({ pathname, qs }: { pathname: string; qs: string }) {
  return (
    <nav className="os-nav" aria-label="Main">
      {ITEMS.map((it) => {
        const active = it.match(pathname);
        return (
          <Link key={it.href} href={`${it.href}${it.keepScene ? qs : ""}`} prefetch={false} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
            <span className="os-nav-icon">{it.icon}</span>
            <span className="os-nav-label">{it.label}</span>
            {it.hint && <span className="os-nav-hint">{it.hint}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function NodeCard() {
  const node = useDeskNode();
  const word = node ? NODE_WORDS[node.status] : "checking…";
  return (
    <div className="os-node-card">
      <Link href="/desk" prefetch={false} className="os-node-line">
        <span className={`os-node-dot os-node-${node?.color ?? "gray"}${node?.blink ? " is-blinking" : ""}`} aria-hidden />
        <span>Desk button</span>
        <span className="os-node-word">{word}</span>
      </Link>
      <p>Press the button on the front desk and say one thing. It gets filed.</p>
      <Link href="/desk/focus" prefetch={false} className="os-node-mode">Open front-desk screen</Link>
    </div>
  );
}

function NodePill() {
  const node = useDeskNode();
  return (
    <Link href="/desk" prefetch={false} className="os-node-pill" aria-label={`Front desk node: ${node ? NODE_WORDS[node.status] : "checking"}`}>
      <span className={`os-node-dot os-node-${node?.color ?? "gray"}${node?.blink ? " is-blinking" : ""}`} aria-hidden />
      <span>{node ? NODE_WORDS[node.status] : "node"}</span>
    </Link>
  );
}

function TabBar({ pathname }: { pathname: string }) {
  const qs = useSceneQs();
  const { open, setOpen } = useVeridian();
  const tab = (it: Item) => {
    const active = it.match(pathname);
    return (
      <Link key={it.href} href={`${it.href}${it.keepScene ? qs : ""}`} prefetch={false} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}>
        {it.icon}
        <span>{it.label === "The Desk" ? "Desk" : it.label}</span>
      </Link>
    );
  };
  return (
    <nav className="os-tabbar" aria-label="Main">
      {tab(ITEMS[0])}
      {tab(ITEMS[1])}
      <button type="button" className={`os-tab-mic${open ? " is-open" : ""}`} aria-label={open ? "Close Veridian" : "Talk to Veridian"} aria-expanded={open} aria-controls="veridian-panel" onClick={() => setOpen(!open)}>
        <IconMic size={24} />
      </button>
      {tab(ITEMS[2])}
      {tab(ITEMS[3])}
    </nav>
  );
}

/**
 * Veridian OS shell. Desktop: the Option B sidebar, the page, and the Veridian
 * panel beside it. Today (the sidebar's first item) is the Option A home with
 * the dock. Phones: a slim top bar, the page, and a tab bar with the mic in the
 * middle. Desk mode (/desk/focus) drops all chrome for the front desk screen.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "/";
  const { open } = useVeridian();
  const showDock = pathname !== "/desk/focus";

  if (pathname === "/desk/focus") return <div className="os-focus">{children}</div>;

  return (
    <div className={`os-shell${open ? " os-panel-open" : ""}`}>
      <aside className="os-sidebar" aria-label="Veridian OS">
        <Link href="/" prefetch={false} className="os-brand" aria-label="Veridian home">
          <VeridianMark size={22} />
          <span className="os-brand-word">Veridian</span>
          <span className="os-brand-tag">desk</span>
        </Link>
        <div className="os-theme-row"><ThemeToggle /></div>
        <Suspense fallback={<NavList pathname={pathname} qs="" />}>
          <SidebarNav pathname={pathname} />
        </Suspense>
        <div className="os-sidebar-ask">
          <VeridianCTA />
        </div>
        <div className="os-sidebar-foot">
          <NodeCard />
          <Suspense fallback={null}>
            <ProfileMenu />
          </Suspense>
        </div>
      </aside>

      <header className="os-topbar">
        <Link href="/" prefetch={false} className="os-brand" aria-label="Veridian home">
          <VeridianMark size={22} />
          <span className="os-brand-word">Veridian</span>
        </Link>
        <div className="os-topbar-right">
          <ThemeToggle />
          <NodePill />
          <Link href="/setup" prefetch={false} className="os-icon-link" aria-label="Your Veridian settings">
            <IconSetup />
          </Link>
          <Suspense fallback={null}>
            <ProfileMenu />
          </Suspense>
        </div>
      </header>

      <div className="os-content">
        <main className="app-main">{children}</main>
        <footer className="ftr">Demo for Tidepath Family Alliance. Every person, school and dollar here is made up.</footer>
        {showDock && <TodayDock home={pathname === "/"} desk={pathname.startsWith("/desk")} />}
      </div>

      <Suspense fallback={null}>
        <TabBar pathname={pathname} />
      </Suspense>
    </div>
  );
}
