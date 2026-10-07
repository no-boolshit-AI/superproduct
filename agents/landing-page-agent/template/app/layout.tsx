import type { Metadata } from "next";
import type { ReactNode } from "react";
import { site } from "@/site.config";
import "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: site.metadata.title,
  description: site.metadata.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-canvas font-sans text-ink">{children}</body>
    </html>
  );
}
