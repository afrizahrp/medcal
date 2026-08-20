"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { apiFetch, isForbidden } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AccessDenied } from "../../../components/access-denied";

type Role = "SUPERADMIN" | "ADMIN" | "SUPERVISOR" | "TECHNICIAN" | "FINANCE" | "CUSTOMER";

interface Grant {
  resource: string;
  action: string;
}

interface RoleGrantSummary {
  role: Role;
  grants: Grant[];
  readOnly: boolean;
}

const ROLES: Role[] = ["SUPERADMIN", "ADMIN", "SUPERVISOR", "TECHNICIAN", "FINANCE", "CUSTOMER"];

// Human-readable labels for the code-defined permission catalog's resources.
// The underlying resource identifiers never change — this is display only.
const RESOURCE_LABELS: Record<string, string> = {
  managementDashboard: "Dashboard",
  customerDashboard: "Customer Dashboard",
  users: "Users",
  membership: "Membership",
  whitelist: "Email Whitelist",
  lead: "Leads",
  chat: "Chat",
  email: "Email",
  contactMessage: "Contact Messages",
  menu: "Menu Management",
  permission: "Permission Management",
};

const ACTION_LABELS: Record<string, string> = {
  read: "Read",
  create: "Create",
  update: "Edit",
  manage: "Manage",
  send: "Send",
  delete: "Delete",
  reply: "Reply",
  close: "Close",
};

const selectClassName =
  "flex h-9 w-64 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function grantKey(grant: Grant): string {
  return `${grant.resource}:${grant.action}`;
}

export default function PermissionManagementPage() {
  const [catalog, setCatalog] = useState<Record<string, readonly string[]>>({});
  const [role, setRole] = useState<Role>("SUPERVISOR");
  const [summary, setSummary] = useState<RoleGrantSummary | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const loadRole = useCallback(async (targetRole: Role) => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    setSavedAt(null);
    try {
      const data = await apiFetch<RoleGrantSummary>(`/permissions/roles/${targetRole}`);
      setSummary(data);
      setChecked(new Set(data.grants.map(grantKey)));
    } catch (err) {
      if (isForbidden(err)) {
        setForbidden(true);
      } else {
        setError("Gagal memuat grant untuk role ini.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const catalogData = await apiFetch<Record<string, readonly string[]>>("/permissions/catalog");
        setCatalog(catalogData);
      } catch (err) {
        if (isForbidden(err)) {
          setForbidden(true);
        }
      }
    }
    init();
  }, []);

  useEffect(() => {
    loadRole(role);
  }, [role, loadRole]);

  function toggle(grant: Grant) {
    if (summary?.readOnly) return;
    setChecked((prev) => {
      const next = new Set(prev);
      const key = grantKey(grant);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function save() {
    if (!summary || summary.readOnly) return;
    setSaving(true);
    setError(null);
    setSavedAt(null);
    try {
      const grants: Grant[] = [...checked].map((key) => {
        const [resource, action] = key.split(":");
        return { resource, action };
      });
      const updated = await apiFetch<RoleGrantSummary>(`/permissions/roles/${role}`, {
        method: "PUT",
        body: JSON.stringify({ grants }),
      });
      setSummary(updated);
      setChecked(new Set(updated.grants.map(grantKey)));
      setSavedAt(Date.now());
    } catch {
      setError("Gagal menyimpan perubahan permission.");
    } finally {
      setSaving(false);
    }
  }

  if (forbidden) {
    return <AccessDenied />;
  }

  const resources = Object.keys(catalog);

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Permission Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Atur permission yang dimiliki setiap role. Perubahan berlaku langsung tanpa deploy — memengaruhi
            akses backend dan tampilan menu secara real-time.
          </p>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <label htmlFor="role-select" className="text-sm font-medium text-slate-700">
          Role
        </label>
        <select
          id="role-select"
          className={selectClassName}
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {summary?.readOnly && (
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Semua permission (tidak dapat diubah)
          </Badge>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {savedAt && <p className="mt-4 text-sm text-emerald-600">Perubahan tersimpan.</p>}

      {loading ? (
        <div className="mt-6 flex items-center justify-center py-12">
          <p className="text-sm text-slate-400">Memuat...</p>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {resources.map((resource) => (
                  <tr key={resource}>
                    <td className="w-48 px-4 py-3 align-top font-medium text-slate-900">
                      {RESOURCE_LABELS[resource] ?? resource}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-4">
                        {catalog[resource].map((action) => {
                          const grant = { resource, action };
                          const key = grantKey(grant);
                          return (
                            <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300"
                                checked={checked.has(key)}
                                disabled={Boolean(summary?.readOnly)}
                                onChange={() => toggle(grant)}
                              />
                              {ACTION_LABELS[action] ?? action}
                            </label>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end border-t border-slate-200 p-4">
            <Button onClick={save} disabled={saving || Boolean(summary?.readOnly)}>
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
