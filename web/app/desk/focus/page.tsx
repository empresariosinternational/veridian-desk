import DeskConsole from "@/components/desk/DeskConsole";
import { DeskLegend, DeskModeTop } from "@/components/os/DeskModeBar";

export const metadata = {
  title: "Desk mode · Veridian Desk",
  description: "The front desk screen: the node, the live transcript and what was filed, with nothing else on screen.",
};

/** Desk mode drops the sidebar, tab bar and dock (see AppShell) for the front desk screen. */
export default function DeskFocusPage() {
  return (
    <main className="os-focus-main">
      <DeskModeTop focus />
      <DeskConsole stage />
      <DeskLegend />
    </main>
  );
}
