"use client";

import { useMemo } from "react";
import VeridianMark from "@/components/VeridianMark";
import { greetingForHour } from "@/lib/crm";

type Props = {
  hostCount: number;
  eventCount: number;
  cityCount: number;
  followUpHint?: string;
};

export default function DashboardGreeting({
  hostCount,
  eventCount,
  cityCount,
  followUpHint,
}: Props) {
  const greet = useMemo(() => greetingForHour(), []);

  return (
    <header className="dash-hero">
      <div className="dash-hero-brand">
        <VeridianMark size={20} />
        <span className="veridian-tag">veridian</span>
      </div>
      <h1 className="dash-greet">
        {greet}. here&apos;s your scene.
      </h1>
      <p className="sub dash-summary">
        {hostCount} hosts · {eventCount} upcoming · {cityCount} cities
        {followUpHint ? ` · ${followUpHint}` : ""}
        {" · "}
        <a className="inline-link" href="/setup">
          change setup
        </a>
      </p>
    </header>
  );
}
