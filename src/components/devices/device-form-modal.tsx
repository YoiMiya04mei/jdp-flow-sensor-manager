"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Server,
  Network,
  Shield,
  KeyRound,
  Radio,
  Check,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import type { DeviceVendor, DeviceRole, DeviceStatus, SnmpVersion } from "@/types";

interface DeviceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialDevice?: any;
}

const VENDOR_MODELS: Record<string, string[]> = {
  juniper: ["MX480", "MX960", "MX204", "PTX1000", "vMX", "QFX5120", "SRX345"],
  huawei: ["NE40E-X8", "NE40E-M2K", "NetEngine 8000", "CloudEngine 6800", "AR6140"],
  mikrotik: ["CCR2216-1G-12XS-2XQ", "CCR2004-1G-12S+2XS", "CCR1072-1G-8S+", "CCR1036-8G-2S+", "RB5009UG+S+IN"],
  cisco: ["ASR-9901", "ASR-1001-X", "ASR-9000", "Catalyst 9500", "NCS-5500", "C8300"],
  nokia: ["7750 SR-1", "7750 SR-7", "7250 IXR-e", "7210 SAS"],
  zte: ["ZXR10 M6000", "ZXR10 5900E", "ZXR10 9900"],
  other: [],
};

export function DeviceFormModal({
  isOpen,
  onClose,
  onSuccess,
  initialDevice,
}: DeviceFormModalProps) {
  const isEdit = Boolean(initialDevice?.id);

  // Form states
  const [hostname, setHostname] = useState("");
  const [managementIp, setManagementIp] = useState("");
  const [vendor, setVendor] = useState<DeviceVendor>("juniper");
  const [model, setModel] = useState("");
  const [role, setRole] = useState<DeviceRole>("edge");
  const [asnNumber, setAsnNumber] = useState<string>("");
  const [asnName, setAsnName] = useState("");
  const [locationSite, setLocationSite] = useState("");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<DeviceStatus>("active");

  // SNMP states
  const [snmpEnabled, setSnmpEnabled] = useState(false);
  const [snmpVersion, setSnmpVersion] = useState<SnmpVersion>("v3");
  const [snmpPort, setSnmpPort] = useState(161);
  const [snmpCommunity, setSnmpCommunity] = useState("");
  const [snmpV3User, setSnmpV3User] = useState("");
  const [snmpV3AuthProto, setSnmpV3AuthProto] = useState<string>("SHA256");
  const [snmpV3AuthPass, setSnmpV3AuthPass] = useState("");
  const [snmpV3PrivProto, setSnmpV3PrivProto] = useState<string>("AES128");
  const [snmpV3PrivPass, setSnmpV3PrivPass] = useState("");
  const [changeSnmpCredentials, setChangeSnmpCredentials] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialDevice) {
      setHostname(initialDevice.hostname || "");
      setManagementIp(initialDevice.managementIp || "");
      setVendor(initialDevice.vendor || "juniper");
      setModel(initialDevice.model || "");
      setRole(initialDevice.role || "edge");
      setAsnNumber(initialDevice.asnNumber ? String(initialDevice.asnNumber) : "");
      setAsnName(initialDevice.asnName || "");
      setLocationSite(initialDevice.locationSite || "");
      setTags(initialDevice.tags || "");
      setNotes(initialDevice.notes || "");
      setStatus(initialDevice.status || "active");
      setSnmpEnabled(Boolean(initialDevice.snmpVersion));
      setSnmpVersion(initialDevice.snmpVersion || "v3");
      setSnmpPort(initialDevice.snmpPort || 161);
      setSnmpV3User(initialDevice.snmpV3User || "");
      setSnmpV3AuthProto(initialDevice.snmpV3AuthProto || "SHA256");
      setSnmpV3PrivProto(initialDevice.snmpV3PrivProto || "AES128");
      setChangeSnmpCredentials(false);
    } else {
      // Reset defaults
      setHostname("");
      setManagementIp("");
      setVendor("juniper");
      setModel("MX480");
      setRole("edge");
      setAsnNumber("");
      setAsnName("");
      setLocationSite("");
      setTags("");
      setNotes("");
      setStatus("active");
      setSnmpEnabled(true);
      setSnmpVersion("v3");
      setSnmpPort(161);
      setSnmpCommunity("");
      setSnmpV3User("");
      setSnmpV3AuthProto("SHA256");
      setSnmpV3AuthPass("");
      setSnmpV3PrivProto("AES128");
      setSnmpV3PrivPass("");
      setChangeSnmpCredentials(true);
    }
  }, [initialDevice, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload: Record<string, any> = {
      hostname: hostname.trim(),
      managementIp: managementIp.trim(),
      vendor,
      model: model.trim() || null,
      role,
      asnNumber: asnNumber ? parseInt(asnNumber, 10) : null,
      asnName: asnName.trim() || null,
      locationSite: locationSite.trim() || null,
      tags: tags.trim() || null,
      notes: notes.trim() || null,
      status,
      snmpEnabled,
      snmpVersion,
      snmpPort,
    };

    if (snmpEnabled) {
      if (isEdit) {
        payload.changeSnmpCredentials = changeSnmpCredentials;
      }
      if (!isEdit || changeSnmpCredentials) {
        if (snmpVersion === "v2c") {
          payload.snmpCommunity = snmpCommunity.trim();
        } else {
          payload.snmpV3User = snmpV3User.trim();
          payload.snmpV3AuthProto = snmpV3AuthProto;
          payload.snmpV3AuthPass = snmpV3AuthPass;
          payload.snmpV3PrivProto = snmpV3PrivProto;
          payload.snmpV3PrivPass = snmpV3PrivPass;
        }
      }
    }

    try {
      const url = isEdit ? `/api/devices/${initialDevice.id}` : "/api/devices";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Gagal menyimpan perangkat");
      } else {
        onSuccess();
        onClose();
      }
    } catch {
      setError("Terjadi kesalahan jaringan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 flex items-center justify-center">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                {isEdit ? "Edit Network Device" : "Add New Network Device"}
              </h2>
              <p className="text-[11px] text-slate-400">
                Konfigurasi inventori router flow exporter dan kredensial SNMP aman.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Device Info */}
          <div>
            <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-1.5 font-mono">
              <Server className="w-3.5 h-3.5" />
              <span>1. Device Information</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Hostname <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. id-jkt-core-rtr01"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Management IP <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 10.200.0.1 or 2001:db8::1"
                  value={managementIp}
                  onChange={(e) => setManagementIp(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Vendor <span className="text-rose-400">*</span>
                </label>
                <select
                  value={vendor}
                  onChange={(e) => {
                    const newVendor = e.target.value as DeviceVendor;
                    setVendor(newVendor);
                    const catalog = VENDOR_MODELS[newVendor];
                    if (catalog && catalog.length > 0) {
                      setModel(catalog[0]);
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 capitalize"
                >
                  <option value="juniper">Juniper</option>
                  <option value="huawei">Huawei</option>
                  <option value="mikrotik">MikroTik</option>
                  <option value="cisco">Cisco</option>
                  <option value="nokia">Nokia</option>
                  <option value="zte">ZTE</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Model / Series
                </label>
                {VENDOR_MODELS[vendor]?.length > 0 ? (
                  <div className="flex gap-2">
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    >
                      {VENDOR_MODELS[vendor].map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. Model X"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Device Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as DeviceRole)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 capitalize"
                >
                  <option value="core">Core Router</option>
                  <option value="edge">Edge / Border Gateway</option>
                  <option value="distribution">Distribution</option>
                  <option value="access">Access / Aggregation</option>
                  <option value="firewall">Firewall / CGNAT</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Device Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DeviceStatus)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 capitalize"
                >
                  <option value="active">Active (In Service)</option>
                  <option value="unreachable">Unreachable</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Network Identity & Location */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-3 flex items-center gap-1.5 font-mono">
              <Network className="w-3.5 h-3.5" />
              <span>2. Network Identity & Location</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  BGP ASN Number
                </label>
                <input
                  type="number"
                  placeholder="e.g. 7713"
                  value={asnNumber}
                  onChange={(e) => setAsnNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  BGP ASN / Organization Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. PT Telkom Indonesia"
                  value={asnName}
                  onChange={(e) => setAsnName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Site / POP / Datacenter Location
                </label>
                <input
                  type="text"
                  placeholder="e.g. IDC 3D Duren Tiga, Jakarta"
                  value={locationSite}
                  onChange={(e) => setLocationSite(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Tags (Comma separated)
                </label>
                <input
                  type="text"
                  placeholder="CORE, BACKBONE"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 uppercase font-mono"
                />
              </div>
            </div>
          </div>

          {/* Section 3: SNMP Configuration */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Shield className="w-3.5 h-3.5" />
                <span>3. SNMP Interface Discovery & Credentials</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={snmpEnabled}
                  onChange={(e) => setSnmpEnabled(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0"
                />
                <span className="font-medium">Enable SNMP Discovery</span>
              </label>
            </div>

            {snmpEnabled && (
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      SNMP Version
                    </label>
                    <select
                      value={snmpVersion}
                      onChange={(e) => setSnmpVersion(e.target.value as SnmpVersion)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    >
                      <option value="v3">SNMPv3 (Preferred & Secure)</option>
                      <option value="v2c">SNMPv2c (Legacy Community)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      SNMP Port
                    </label>
                    <input
                      type="number"
                      value={snmpPort}
                      onChange={(e) => setSnmpPort(parseInt(e.target.value, 10) || 161)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                </div>

                {/* Edit mode toggle for changing secrets */}
                {isEdit && (
                  <label className="flex items-center gap-2 text-xs text-cyan-400 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={changeSnmpCredentials}
                      onChange={(e) => setChangeSnmpCredentials(e.target.checked)}
                      className="rounded bg-slate-950 border-slate-800 text-cyan-500 focus:ring-0"
                    />
                    <span>Perbarui Kredensial SNMP yang tersimpan</span>
                  </label>
                )}

                {/* Secret fields */}
                {(!isEdit || changeSnmpCredentials) && (
                  <>
                    {snmpVersion === "v2c" ? (
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Community String (AES-256 Encrypted)
                        </label>
                        <input
                          type="password"
                          placeholder="e.g. noc-read-community"
                          value={snmpCommunity}
                          onChange={(e) => setSnmpCommunity(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">
                            SNMPv3 Security Username
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. jdp-snmp-user"
                            value={snmpV3User}
                            onChange={(e) => setSnmpV3User(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-300 mb-1">
                            Auth Protocol & Password
                          </label>
                          <div className="flex gap-2">
                            <select
                              value={snmpV3AuthProto}
                              onChange={(e) => setSnmpV3AuthProto(e.target.value)}
                              className="w-28 px-2 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 font-mono"
                            >
                              <option value="SHA256">SHA256</option>
                              <option value="SHA">SHA</option>
                              <option value="MD5">MD5</option>
                            </select>
                            <input
                              type="password"
                              placeholder="Auth Password"
                              value={snmpV3AuthPass}
                              onChange={(e) => setSnmpV3AuthPass(e.target.value)}
                              className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 font-mono"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-medium text-slate-300 mb-1">
                            Privacy Protocol & Encryption Key
                          </label>
                          <div className="flex gap-2">
                            <select
                              value={snmpV3PrivProto}
                              onChange={(e) => setSnmpV3PrivProto(e.target.value)}
                              className="w-28 px-2 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 font-mono"
                            >
                              <option value="AES128">AES128</option>
                              <option value="AES256">AES256</option>
                              <option value="DES">DES</option>
                            </select>
                            <input
                              type="password"
                              placeholder="Privacy Encryption Key"
                              value={snmpV3PrivPass}
                              onChange={(e) => setSnmpV3PrivPass(e.target.value)}
                              className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 font-mono"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Catatan Operasional / Notes
            </label>
            <textarea
              rows={2}
              placeholder="Catatan topologi, peer IP, atau instruksi NOC..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 text-xs font-bold transition-all shadow-md disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? "Menyimpan..." : isEdit ? "Update Perangkat" : "Simpan Perangkat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

