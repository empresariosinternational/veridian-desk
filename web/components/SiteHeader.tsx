"use client";

import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import ProfileMenu from "@/components/ProfileMenu";

const LINKS = [
  ["home", "/"],
  ["the pond", "/social-scene"],
  ["crm", "/crm"],
  ["desk", "/desk"],
  ["setup", "/setup"],
] as const;

function NavLinks() {
  const reduce = useReducedMotion();
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
      {LINKS.map(([label, href], i) => {
        const withQs = href === "/setup" ? href : `${href}${qs}`;
        const active =
          href === "/"
            ? pathname === "/"
            : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <motion.a
            key={href}
            href={withQs}
            className={active ? "nav-active" : undefined}
            aria-current={active ? "page" : undefined}
            custom={0.04 + i * 0.04}
            variants={fadeUp}
            initial={reduce ? false : "hidden"}
            animate={reduce ? undefined : "show"}
            whileHover={reduce ? undefined : { scale: 1.02 }}
            whileTap={reduce ? undefined : { scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
          >
            {label}
          </motion.a>
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
      <motion.a
        href="/"
        className="brand"
        aria-label="agentscene home"
        whileHover={reduce ? undefined : { opacity: 0.7 }}
        transition={{ duration: 0.12 }}
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
      </motion.a>

      <div className="hdr-center">
        <nav aria-label="primary">
          <Suspense fallback={null}>
            <NavLinks />
          </Suspense>
        </nav>
      </div>

      <div className="hdr-right">
        <Suspense fallback={<div className="profile-tab skeleton" aria-hidden />}>
          <ProfileMenu />
        </Suspense>
      </div>
    </motion.header>
  );
}
