import React from "react";
import Link from "next/link";
import { ArrowLeft, Clock, ShieldAlert } from "lucide-react";

interface ComingSoonProps {
  title: string;
  targetPhase: string;
  description: string;
  plannedFeatures: string[];
}

export function ComingSoon({
  title,
  targetPhase,
  description,
  plannedFeatures,
}: ComingSoonProps) {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 backdrop-blur-sm">
        <div className="flex items-center gap-3 text-cyan-400 mb-2">
          <Clock className="w-5 h-5 animate-pulse" />
          <span className="text-xs uppercase font-mono tracking-wider font-semibold">
            {targetPhase}
          </span>
        </div>

        <h1 className="text-2xl font-bold text-slate-100 mb-3">{title}</h1>
        <p className="text-slate-400 text-sm mb-6 max-w-2xl">{description}</p>

        <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-5 mb-8">
          <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Fitur Terencana Sesuai PRD:
          </div>
          <ul className="space-y-2">
            {plannedFeatures.map((feat, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 text-xs text-slate-400"
              >
                <span className="text-cyan-500 font-bold">•</span>
                <span>{feat}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-800/60 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <span>
              Status Jujur: Modul ini belum diimplementasikan pada Phase 1 sesuai aturan PRD.
            </span>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Overview
          </Link>
        </div>
      </div>
    </div>
  );
}

