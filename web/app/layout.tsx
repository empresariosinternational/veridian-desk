import "./globals.css";
import SiteHeader from "@/components/SiteHeader";
import { SceneProvider } from "@/components/SceneBridge";
import VeridianDockHost from "@/components/VeridianDockHost";
import { VeridianProvider } from "@/components/VeridianContext";

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
            <SiteHeader />
            <main className="app-main">{children}</main>
            <footer className="ftr">
              your follows · your zip · your URL. CRM on-device. no signup, no DB.
            </footer>
            <VeridianDockHost />
          </VeridianProvider>
        </SceneProvider>
      </body>
    </html>
  );
}
