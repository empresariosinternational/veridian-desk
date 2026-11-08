import YourVeridian from "@/components/os/YourVeridian";
import SceneSetup from "@/components/os/SceneSetup";

export const metadata = {
  title: "Your Veridian · agentscene",
  description: "Goals, autonomy, context and voice for your Veridian assistant, plus your city scene.",
};

export default function SetupPage() {
  return (
    <>
      <YourVeridian />
      <div className="os-setup-scene">
        <SceneSetup />
      </div>
    </>
  );
}
