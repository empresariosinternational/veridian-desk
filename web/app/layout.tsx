import "./globals.css";
import AppShell from "@/components/os/AppShell";
import { SceneProvider } from "@/components/SceneBridge";
import VeridianDockHost from "@/components/VeridianDockHost";
import { VeridianProvider } from "@/components/VeridianContext";

/** Phone browser chrome matches the warm lavender canvas. */
export const viewport = { themeColor: "#F8F0FE", colorScheme: "light" as const };

export const metadata = {
  title: "agentscene",
  description: "your scene, your agents — events, people, and AI debriefs from the people you follow.",
  openGraph: {
    title: "agentscene",
    description: "your scene, your agents — events, people, and AI debriefs from the people you follow.",
    siteName: "agentscene",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://images.lumacdn.com" crossOrigin="anonymous" />
      </head>
      <body>
        <SceneProvider>
          <VeridianProvider>
            <AppShell>{children}</AppShell>
            <VeridianDockHost />
          </VeridianProvider>
        </SceneProvider>
      </body>
    </html>
  );
}
