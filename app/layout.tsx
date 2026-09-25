import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PromptForge AI",
  description: "Analyze, optimize and evaluate prompts for Large Language Models.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
