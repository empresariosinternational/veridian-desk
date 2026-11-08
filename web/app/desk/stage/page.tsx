import DeskConsole from "@/components/desk/DeskConsole";

export const metadata = {
  title: "Veridian Desk · stage view",
  description: "Say it once. The desk files it, tells the right person today, and keeps private things private.",
};

export default function DeskStagePage() {
  return <DeskConsole stage />;
}
