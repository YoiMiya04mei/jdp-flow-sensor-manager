import React from "react";
import { ComingSoon } from "@/components/ui/coming-soon";

export default function SettingsPage() {
  return (
    <ComingSoon
      title="System & Collector Settings"
      targetPhase="Target Phase 8"
      description="Konfigurasi global sistem NOC, ambang batas stale sensor, integrasi BGP feed, dan retensi data."
      plannedFeatures={[
        "Pengaturan UDP Collector Host & Port (NetFlow / IPFIX / sFlow).",
        "Threshold waktu toleransi sensor Active / Stale (default: 180s).",
        "Manajemen pengguna dan penetapan role RBAC.",
        "Sumber pembaruan ASN Enrichment directory (BGP table dump / RIR).",
        "Retensi data analitik dan kebijakan pembersihan log.",
      ]}
    />
  );
}

