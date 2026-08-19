"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Mail, Plus, ShieldX, XCircle } from "lucide-react";
import { ApiError, apiFetch, isForbidden } from "@medcal/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AccessDenied } from "../../../components/access-denied";

type WhitelistStatus = "ACTIVE" | "REVOKED";

interface WhitelistEntry {
  id: string;
  email: string;
  status: WhitelistStatus;
  createdAt: string;
  revokedAt: string | null;
}

const STATUS_COLORS: Record<WhitelistStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800",
  REVOKED: "bg-red-100 text-red-800",
};

export default function WhitelistPage() {
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const data = await apiFetch<WhitelistEntry[]>("/whitelist");
      setEntries(data);
    } catch (err) {
      if (isForbidden(err)) {
        setForbidden(true);
      } else {
        setError("Gagal memuat daftar whitelist.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (forbidden) {
    return <AccessDenied />;
  }

  async function addEntry() {
    if (!newEmail.trim()) return;
    setAdding(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch("/whitelist", {
        method: "POST",
        body: JSON.stringify({ email: newEmail.trim().toLowerCase() }),
      });
      setSuccess(`Email ${newEmail} berhasil ditambahkan ke whitelist.`);
      setNewEmail("");
      setShowForm(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("Email sudah ada di whitelist.");
      } else {
        setError("Gagal menambahkan email ke whitelist.");
      }
    } finally {
      setAdding(false);
    }
  }

  async function revokeEntry(id: string, email: string) {
    if (!confirm(`Yakin ingin mencabut akses untuk ${email}?`)) return;
    setRevokingId(id);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/whitelist/${id}/revoke`, { method: "POST" });
      setSuccess(`Akses untuk ${email} berhasil dicabut.`);
      await load();
    } catch {
      setError("Gagal mencabut akses.");
    } finally {
      setRevokingId(null);
    }
  }

  const activeCount = entries.filter((e) => e.status === "ACTIVE").length;
  const revokedCount = entries.filter((e) => e.status === "REVOKED").length;

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Email Whitelist</h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola email yang diizinkan untuk mendaftar
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} disabled={showForm}>
          <Plus className="h-4 w-4" />
          Tambah Email
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{activeCount}</p>
              <p className="text-sm text-slate-500">Email Aktif</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-slate-900">{revokedCount}</p>
              <p className="text-sm text-slate-500">Email Dicabut</p>
            </div>
          </div>
        </div>
      </div>

      {showForm && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Tambah Email Baru</h2>
          <p className="mt-1 text-sm text-slate-500">
            Email yang ditambahkan akan bisa mendaftar ke aplikasi.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Input
              type="email"
              placeholder="email@example.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              disabled={adding}
              className="flex-1"
            />
            <div className="flex gap-2">
              <Button onClick={addEntry} disabled={adding || !newEmail.trim()}>
                <Plus className="h-4 w-4" />
                Tambah
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setNewEmail("");
                }}
                disabled={adding}
              >
                Batal
              </Button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {success && <p className="mt-4 text-sm text-emerald-600">{success}</p>}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-slate-400">Memuat...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Mail className="h-12 w-12 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">Belum ada email di whitelist</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Ditambahkan</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{entry.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_COLORS[entry.status]}>
                        {entry.status === "ACTIVE" ? "Aktif" : "Dicabut"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(entry.createdAt).toLocaleDateString("id-ID")}
                    </td>
                    <td className="px-4 py-3">
                      {entry.status === "ACTIVE" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => revokeEntry(entry.id, entry.email)}
                          disabled={revokingId === entry.id}
                        >
                          <ShieldX className="h-4 w-4" />
                          Cabut
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
