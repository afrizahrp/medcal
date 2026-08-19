"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ListTree, Pencil, Plus, Trash2 } from "lucide-react";
import { apiFetch, ApiError, isForbidden } from "@medcal/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../components/access-denied";

type MenuApplication = "MANAGEMENT" | "TECHNICIAN" | "CUSTOMER";

interface MenuRow {
  id: string;
  application: MenuApplication;
  code: string;
  parentId: string | null;
  label: string;
  href: string | null;
  icon: string | null;
  order: number;
  isGroup: boolean;
  isActive: boolean;
  viewResource: string | null;
  viewAction: string | null;
}

const APPLICATIONS: MenuApplication[] = ["MANAGEMENT", "TECHNICIAN", "CUSTOMER"];

export default function MenuManagementPage() {
  const [rows, setRows] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const data = await apiFetch<MenuRow[]>("/menu");
      setRows(data);
    } catch (err) {
      if (isForbidden(err)) {
        setForbidden(true);
      } else {
        setError("Gagal memuat daftar menu.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleActive(row: MenuRow) {
    try {
      await apiFetch(`/menu/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      await load();
    } catch {
      setError("Gagal mengubah status menu.");
    }
  }

  async function remove(row: MenuRow) {
    if (!confirm(`Yakin ingin menghapus menu "${row.label}"?`)) return;
    setDeletingId(row.id);
    setError(null);
    try {
      await apiFetch(`/menu/${row.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError("Menu ini masih memiliki sub-menu — hapus atau pindahkan sub-menu terlebih dahulu.");
      } else {
        setError("Gagal menghapus menu.");
      }
    } finally {
      setDeletingId(null);
    }
  }

  if (forbidden) {
    return <AccessDenied />;
  }

  const byLabel = new Map(rows.map((r) => [r.id, r.label]));

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Menu Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola struktur navigasi per aplikasi. Visibilitas tetap ditentukan oleh permission RBAC —
            halaman ini hanya mengatur struktur/label/urutan.
          </p>
        </div>
        <Link href="/menu-management/new">
          <Button>
            <Plus className="h-4 w-4" />
            Tambah Menu
          </Button>
        </Link>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="mt-6 flex items-center justify-center py-12">
          <p className="text-sm text-slate-400">Memuat...</p>
        </div>
      ) : (
        APPLICATIONS.map((application) => {
          const appRows = rows
            .filter((r) => r.application === application)
            .sort((a, b) => (a.parentId ?? "").localeCompare(b.parentId ?? "") || a.order - b.order);

          return (
            <div key={application} className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-200 p-4">
                <ListTree className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900">{application}</h2>
                <Badge variant="secondary">{appRows.length} menu</Badge>
              </div>

              {appRows.length === 0 ? (
                <p className="p-4 text-sm text-slate-400">Belum ada menu untuk aplikasi ini.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                        <th className="px-4 py-3">Label</th>
                        <th className="px-4 py-3">Code</th>
                        <th className="px-4 py-3">Parent</th>
                        <th className="px-4 py-3">Tipe</th>
                        <th className="px-4 py-3">Permission</th>
                        <th className="px-4 py-3">Urutan</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {appRows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{row.label}</td>
                          <td className="px-4 py-3 text-sm text-slate-500">{row.code}</td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {row.parentId ? byLabel.get(row.parentId) ?? "—" : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{row.isGroup ? "Group" : "Leaf"}</Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">
                            {row.viewResource ? `${row.viewResource}:${row.viewAction}` : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500">{row.order}</td>
                          <td className="px-4 py-3">
                            <button type="button" onClick={() => toggleActive(row)}>
                              <Badge className={row.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}>
                                {row.isActive ? "Aktif" : "Nonaktif"}
                              </Badge>
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <Link href={`/menu-management/${row.id}`}>
                                <Button variant="ghost" size="sm">
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </Link>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => remove(row)}
                                disabled={deletingId === row.id}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
