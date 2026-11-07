"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import ProfileMenu from "@/components/ProfileMenu";
import { VeridianCTA } from "@/components/VeridianContext";

const LINKS = [
  ["home", "/"],
  ["the pond", "/social-scene"],
  ["crm", "/crm"],
  ["desk", "/desk"],
  ["setup", "/setup"],
] as const;

function NavLinks() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const qs = useMemo(() => {
    const cities = searchParams.get("cities");
    const follows = searchParams.get("follows");
    const p = new URLSearchParams();
    if (cities) p.set("cities", cities);
    if (follows) p.set("follows", follows);
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [searchParams]);

  return (
    <>
      {LINKS.map(([label, href]) => {
        const withQs = href === "/setup" ? href : `${href}${qs}`;
        const active =
          href === "/"
            ? pathname === "/"
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={withQs}
            prefetch={false}
            className={active ? "nav-active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}

export default function SiteHeader() {
  const reduce = useReducedMotion();

  return (
    <motion.header
      className="hdr"
      variants={fadeUp}
      custom={0}
      initial={reduce ? false : "hidden"}
      animate={reduce ? undefined : "show"}
    >
      <Link
        href="/"
        prefetch={false}
        className="brand"
        aria-label="agentscene home"
      >
        <Image
          className="brand-logo"
          src="/agentscene-logo.png"
          alt=""
          width={396}
          height={337}
          priority
        />
        <span className="brand-word">agentscene</span>
      </Link>

      <div className="hdr-center">
        <nav aria-label="primary">
          <Suspense fallback={null}>
            <NavLinks />
          </Suspense>
        </nav>
      </div>

      <div className="hdr-right">
        <VeridianCTA />
        <Suspense fallback={<div className="profile-tab skeleton" aria-hidden />}>
          <ProfileMenu />
        </Suspense>
      </div>
    </motion.header>
  );
}
