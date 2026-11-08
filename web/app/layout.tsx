import "./globals.css";
import AppShell from "@/components/os/AppShell";
import { SceneProvider } from "@/components/SceneBridge";
import VeridianDockHost from "@/components/VeridianDockHost";
import JudgeTour from "@/components/os/JudgeTour";
import { VeridianProvider } from "@/components/VeridianContext";

/** Phone browser chrome matches the warm lavender canvas. */
export const viewport = { themeColor: "#F8F0FE", colorScheme: "light" as const };

export const metadata = {
  title: "Veridian Desk · say it once",
  description: "Say it once, by voice or text. The desk files it, tells the right person the same day, and keeps private things private.",
  openGraph: {
    title: "Veridian Desk · say it once",
    description: "Say it once, by voice or text. The desk files it, tells the right person the same day, and keeps private things private.",
    siteName: "Veridian Desk",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem("veridian-theme");if(t==="dark")document.documentElement.dataset.theme="dark"}catch(e){}` }} />
        <link rel="preconnect" href="https://images.lumacdn.com" crossOrigin="anonymous" />
      </head>
      <body>
        <SceneProvider>
          <VeridianProvider>
            <AppShell>{children}</AppShell>
            <VeridianDockHost />
            <JudgeTour />
          </VeridianProvider>
        </SceneProvider>
      </body>
    </html>
  );
}
