import BenchmarksTable from "@/components/BenchmarksTable";
import VeridianDebrief from "@/components/VeridianDebrief";
import FadeIn from "@/components/motion/FadeIn";
import { REGISTRY_AS_OF } from "@/lib/models";

export const metadata = {
  title: "agentscene · benchmarks",
  description: "the agentscene brief — AI model benchmarks, routing picks, and news.",
};

export default function BenchmarksPage() {
  return (
    <>
      <FadeIn>
        <div className="eyebrow">the agentscene brief</div>
        <h1>AI model benchmarks, routed for your workflow.</h1>
        <p className="sub" style={{ marginTop: 8 }}>
          the dashboard that doubles as the newsletter — updated {REGISTRY_AS_OF} · sample dataset, live sources pluggable
        </p>
      </FadeIn>

      <FadeIn delay={0.06}>
        <VeridianDebrief
          title="routing picks · this week"
          intro="Where Veridian would send your work right now, based on the registry below."
          items={[
            {
              name: "Agentic coding → Claude Fable 5",
              reason: "top composite agentic score with a 1M context window — default route for repo-scale work.",
            },
            {
              name: "Cost-sensitive agents → Kimi K3",
              reason: "open-weight, local-deployable, ~6x cheaper than frontier APIs at 89 agentic — the value pick.",
            },
            {
              name: "Private/sensitive context → Hermes 4 (local)",
              reason: "runs fully on-device; the only route for HIGHLY_SENSITIVE data classes until confidential compute lands.",
            },
          ]}
        />
      </FadeIn>

      <FadeIn delay={0.1}>
        <h2>📊 the leaderboard</h2>
        <BenchmarksTable />
      </FadeIn>
    </>
  );
}
