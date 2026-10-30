"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/login" || (pathname !== null && pathname.startsWith("/login"));

  if (isLoginPage) {
    return (
      <main className="min-h-screen bg-[#050811] text-[#f1f5f9] selection:bg-cyan-500 selection:text-slate-950">
        {children}
      </main>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#090d16] text-[#f1f5f9]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 p-6 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
