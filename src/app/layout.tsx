import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Group Project Autopilot",
  description: "Paste the brief, get a plan your whole team can edit and confirm.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
