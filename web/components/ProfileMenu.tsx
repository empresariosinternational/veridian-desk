"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ensureLocalProfile,
  loadSocialStore,
  type SocialProfile,
} from "@/lib/social-scene";

/** Top-right Profile control — always-visible entry to the feature hub. */
export default function ProfileMenu() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const qs = useMemo(() => {
    const cities = searchParams.get("cities");
    const follows = searchParams.get("follows");
    const p = new URLSearchParams();
    if (cities) p.set("cities", cities);
    if (follows) p.set("follows", follows);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [searchParams]);

  useEffect(() => {
    const s = ensureLocalProfile(loadSocialStore());
    setProfile(s.profile);
  }, [pathname, open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = (profile?.displayName || "P").trim().charAt(0).toUpperCase();
  const active = pathname === "/profile" || pathname.startsWith("/profile/");
  const profileHref = `/profile${qs}`;

  const items = [
    { label: "your profile", href: profileHref, hint: "hub" },
    { label: "your social scene", href: `/social-scene/yours${qs}`, hint: "communities" },
    { label: "connections", href: `/social-scene/connections${qs}`, hint: "apps · social" },
    { label: "agent matches", href: `/social-scene/matches${qs}`, hint: "intros" },
    { label: "agents", href: `/social-scene/agents${qs}`, hint: "autonomy" },
    { label: "CRM", href: `/crm${qs}`, hint: "pipeline" },
    { label: "the pond", href: `/social-scene${qs}`, hint: "marketplace" },
  ] as const;

  return (
    <div className="profile-menu" ref={rootRef}>
      <div className={`profile-tab${active ? " on" : ""}`}>
        <Link href={profileHref} prefetch={false} className="profile-tab-main" aria-label="open profile hub">
          <span className="profile-tab-avatar" aria-hidden>
            {initial}
          </span>
          <span className="profile-tab-label">
            <span className="profile-tab-title">profile</span>
            <span className="profile-tab-sub">
              {profile?.displayName && profile.displayName !== "your profile"
                ? profile.displayName
                : "your hub"}
            </span>
          </span>
        </Link>
        <button
          type="button"
          className="profile-tab-chevron"
          aria-label={open ? "close profile menu" : "open profile menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg className="profile-tab-chevron-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3.25 6.1 8 10.85 12.75 6.1" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="profile-dropdown" role="menu">
          <div className="profile-dropdown-head">
            <strong>{profile?.displayName || "your profile"}</strong>
            <span>@{profile?.handle || "you"}</span>
          </div>
          <ul>
            {items.map((it) => (
              <li key={it.href}>
                <Link href={it.href} prefetch={false} role="menuitem" onClick={() => setOpen(false)}>
                  <span>{it.label}</span>
                  <em>{it.hint}</em>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
