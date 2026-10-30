import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";

export const metadata: Metadata = {
  title: "JDP Flow Sensor Manager & Traffic Analyzer",
  description: "Web-based flow sensor management, device provisioning, and ASN/Sankey traffic analytics for ISP NOC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark">
      <body className="bg-[#090d16] text-[#f1f5f9] antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

