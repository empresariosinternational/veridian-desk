"use client";

import dynamic from "next/dynamic";

const VeridianDock = dynamic(() => import("@/components/VeridianDock"), {
  ssr: false,
});

export default function VeridianDockHost() {
  return <VeridianDock />;
}
