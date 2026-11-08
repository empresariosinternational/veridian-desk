import DeskConsole from "@/components/desk/DeskConsole";
import { DeskModeTop } from "@/components/os/DeskModeBar";

export const metadata = {
  title: "Veridian Desk · classic view",
  description: "GPT chat, executive task planning, and push-to-talk filing for nonprofits, communities, and the people in them.",
};

export default function DeskClassicPage() {
  return (
    <>
      <DeskModeTop focus={false} />
      <DeskConsole />
    </>
  );
}
