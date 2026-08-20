"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { apiFetch } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

const APPLICATIONS: MenuApplication[] = [
  "MANAGEMENT",
  "TECHNICIAN",
  "CUSTOMER",
];
const ICONS = [
  "dashboard",
  "leads",
  "messages",
  "chat",
  "email",
  "users",
  "whitelist",
  "menu",
] as const;

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function MenuForm({ menuId }: { menuId?: string }) {
  const router = useRouter();
  const isEdit = Boolean(menuId);

  const [catalog, setCatalog] = useState<Record<string, readonly string[]>>({});
  const [parentOptions, setParentOptions] = useState<MenuRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [application, setApplication] = useState<MenuApplication>("MANAGEMENT");
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [href, setHref] = useState("");
  const [icon, setIcon] = useState<string>("");
  const [order, setOrder] = useState<string>("");
  const [isGroup, setIsGroup] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [parentId, setParentId] = useState<string>("");
  const [viewResource, setViewResource] = useState<string>("");
  const [viewAction, setViewAction] = useState<string>("");

  const loadParentOptions = useCallback(
    async (app: MenuApplication) => {
      const all = await apiFetch<MenuRow[]>(`/menu?application=${app}`);
      setParentOptions(all.filter((m) => m.isGroup && m.id !== menuId));
    },
    [menuId],
  );

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError(null);
      try {
        const catalogData = await apiFetch<Record<string, readonly string[]>>(
          "/menu/permissions-catalog",
        );
        if (cancelled) return;
        setCatalog(catalogData);

        if (menuId) {
          const menu = await apiFetch<MenuRow>(`/menu/${menuId}`);
          if (cancelled) return;
          setApplication(menu.application);
          setCode(menu.code);
          setLabel(menu.label);
          setHref(menu.href ?? "");
          setIcon(menu.icon ?? "");
          setOrder(String(menu.order));
          setIsGroup(menu.isGroup);
          setIsActive(menu.isActive);
          setParentId(menu.parentId ?? "");
          setViewResource(menu.viewResource ?? "");
          setViewAction(menu.viewAction ?? "");
          await loadParentOptions(menu.application);
        } else {
          await loadParentOptions(application);
        }
      } catch {
        if (!cancelled) setError("Gagal memuat data form.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuId]);

  async function handleApplicationChange(next: MenuApplication) {
    setApplication(next);
    setParentId("");
    await loadParentOptions(next);
  }

  const resourceOptions = Object.keys(catalog).sort();
  const actionOptions = viewResource ? (catalog[viewResource] ?? []) : [];

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...(isEdit ? {} : { application }),
        code,
        label,
        parentId: parentId || null,
        order: order === "" ? undefined : Number(order),
        isGroup,
        isActive,
        icon: icon || null,
        href: isGroup ? null : href || null,
        viewResource: isGroup ? null : viewResource || null,
        viewAction: isGroup ? null : viewAction || null,
      };
      if (isEdit) {
        await apiFetch(`/menu/${menuId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/menu", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      router.push("/menu-management");
    } catch {
      setError(
        "Gagal menyimpan menu. Periksa kembali code, parent, dan urutan.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-400">Memuat...</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Baris 1: Aplikasi | Code */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Aplikasi
          </label>
          <select
            value={application}
            onChange={(e) =>
              handleApplicationChange(e.target.value as MenuApplication)
            }
            className={`${selectClassName} mt-1.5`}
            disabled={isEdit}
          >
            {APPLICATIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Code
          </label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1.5"
            placeholder="mis. leads.chat"
          />
        </div>
      </div>

      {/* Baris 2: Label full width */}
      <div>
        <label className="block text-sm font-medium text-slate-700">
          Label
        </label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="mt-1.5"
        />
      </div>

      {/* Baris 3: Parent | Urutan */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Parent (group)
          </label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className={`${selectClassName} mt-1.5`}
          >
            <option value="">— Tidak ada (root) —</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">
            Urutan
          </label>
          <Input
            type="number"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className="mt-1.5 w-full"
            placeholder="auto"
            min={0}
          />
        </div>
      </div>

      {/* Baris 4: Icon | Checkbox group */}
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Icon
          </label>
          <select
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            className={`${selectClassName} mt-1.5`}
          >
            <option value="">— Tidak ada —</option>
            {ICONS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-h-9 items-center gap-2 sm:pb-0.5">
          <input
            id="isGroup"
            type="checkbox"
            checked={isGroup}
            onChange={(e) => setIsGroup(e.target.checked)}
          />
          <label htmlFor="isGroup" className="text-sm text-slate-700">
            Ini adalah group (tidak punya route/permission sendiri)
          </label>
        </div>
      </div>

      {/* Baris 5: Checkbox Aktif */}
      <div className="flex items-center gap-2">
        <input
          id="isActive"
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        <label htmlFor="isActive" className="text-sm text-slate-700">
          Aktif (tampil di navigasi)
        </label>
      </div>

      {/* Route & Permission: Href | Resource | Action */}
      {!isGroup && (
        <div className="rounded-lg border border-slate-200 p-3 sm:p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            Route &amp; Permission
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            Menu ini akan tampil hanya untuk role yang memiliki permission
            berikut (hasPermission).
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Href
              </label>
              <Input
                value={href}
                onChange={(e) => setHref(e.target.value)}
                className="mt-1.5"
                placeholder="/leads"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Resource
              </label>
              <select
                value={viewResource}
                onChange={(e) => {
                  setViewResource(e.target.value);
                  setViewAction("");
                }}
                className={`${selectClassName} mt-1.5`}
              >
                <option value="">— Pilih —</option>
                {resourceOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-slate-700">
                Action
              </label>
              <select
                value={viewAction}
                onChange={(e) => setViewAction(e.target.value)}
                className={`${selectClassName} mt-1.5`}
                disabled={!viewResource}
              >
                <option value="">— Pilih —</option>
                {actionOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex justify-end border-t border-slate-200 pt-4">
        <Button
          onClick={submit}
          disabled={saving || !code || !label}
          className="w-full sm:w-auto"
        >
          <Save className="h-4 w-4" />
          {isEdit ? "Save Changes" : "Create Menu"}
        </Button>
      </div>
    </div>
  );
}
