"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus, Save } from "lucide-react";
import { ApiError, isForbidden } from "@medcal/shared";
import { useAuthz } from "@medcal/auth/client";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import {
  DeviceCapabilityFormFields,
  buildDeviceCapabilityUpdatePayload,
  formatDeviceCapabilityApiError,
  type DeviceCapabilityFormValue,
} from "../device-capability-form-fields";
import {
  DeviceCapabilityItemFormFields,
  buildDeviceCapabilityItemCreatePayload,
  buildDeviceCapabilityItemUpdatePayload,
  type DeviceCapabilityItemFormValue,
} from "../device-capability-item-form-fields";
import {
  type DeviceCapabilityItemRow,
  type DeviceCapabilityRow,
  PageHeader,
  Surface,
  deviceCapabilityFormActionsClass,
  deviceCapabilityFormPageClass,
  deviceCapabilityFormSurfaceClass,
} from "../device-capabilities-ui";
import {
  useCreateDeviceCapabilityItem,
  useDeleteDeviceCapability,
  useDeleteDeviceCapabilityItem,
  useDeviceCapability,
  useUpdateDeviceCapability,
  useUpdateDeviceCapabilityItem,
} from "../use-device-capabilities-query";

const emptyForm: DeviceCapabilityFormValue = {
  code: "",
  name: "",
  description: "",
};

const emptyItemForm: DeviceCapabilityItemFormValue = {
  code: "",
  name: "",
  description: "",
};

function formFromRow(row: DeviceCapabilityRow): DeviceCapabilityFormValue {
  return {
    code: row.code,
    name: row.name,
    description: row.description ?? "",
  };
}

function itemFormFromRow(row: DeviceCapabilityItemRow): DeviceCapabilityItemFormValue {
  return {
    code: row.code,
    name: row.name,
    description: row.description ?? "",
  };
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-slate-700">{children}</dd>
    </div>
  );
}

export default function DeviceCapabilityDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { capabilities } = useAuthz();
  const capabilityQuery = useDeviceCapability(params.id);
  const updateMutation = useUpdateDeviceCapability();
  const deleteMutation = useDeleteDeviceCapability();
  const createItemMutation = useCreateDeviceCapabilityItem();
  const updateItemMutation = useUpdateDeviceCapabilityItem();
  const deleteItemMutation = useDeleteDeviceCapabilityItem();

  const row = capabilityQuery.data;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DeviceCapabilityFormValue>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [itemForm, setItemForm] = useState<DeviceCapabilityItemFormValue>(emptyItemForm);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemForm, setEditItemForm] = useState<DeviceCapabilityItemFormValue>(emptyItemForm);

  useEffect(() => {
    if (!row) return;
    setForm(formFromRow(row));
  }, [row]);

  if (!capabilities?.deviceCapabilityRead) {
    return <AccessDenied />;
  }

  if (capabilityQuery.isLoading) {
    return (
      <div className={deviceCapabilityFormPageClass}>
        <p className="text-sm text-slate-400">Memuat…</p>
      </div>
    );
  }

  if (isForbidden(capabilityQuery.error)) {
    return <AccessDenied />;
  }

  if (capabilityQuery.error instanceof ApiError && capabilityQuery.error.status === 404) {
    return (
      <div className={deviceCapabilityFormPageClass}>
        <PageHeader
          title="Device Capability tidak ditemukan"
          crumbs={[
            { href: "/", label: "Dashboard" },
            { href: "/device-capabilities", label: "Device Capability" },
          ]}
        />
        <p className="mt-5 text-sm text-slate-600">Device Capability tidak ditemukan.</p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className={deviceCapabilityFormPageClass}>
        <p className="text-sm text-red-600">Gagal memuat Device Capability.</p>
      </div>
    );
  }

  const items = row.items ?? [];

  function setField<K extends keyof DeviceCapabilityFormValue>(
    field: K,
    next: DeviceCapabilityFormValue[K],
  ) {
    setForm((prev) => ({ ...prev, [field]: next }));
  }

  function setItemField<K extends keyof DeviceCapabilityItemFormValue>(
    field: K,
    next: DeviceCapabilityItemFormValue[K],
  ) {
    setItemForm((prev) => ({ ...prev, [field]: next }));
  }

  function setEditItemField<K extends keyof DeviceCapabilityItemFormValue>(
    field: K,
    next: DeviceCapabilityItemFormValue[K],
  ) {
    setEditItemForm((prev) => ({ ...prev, [field]: next }));
  }

  function resetForm() {
    setForm(formFromRow(row!));
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.deviceCapabilityUpdate) return;
    setError(null);
    setSuccess(null);

    if (!form.code.trim()) {
      setError("Kode capability wajib diisi.");
      return;
    }
    if (!form.name.trim()) {
      setError("Nama capability wajib diisi.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: row!.id,
        input: buildDeviceCapabilityUpdatePayload(form),
      });
      setSuccess("Perubahan tersimpan.");
      setEditing(false);
      await capabilityQuery.refetch();
    } catch (err) {
      setError(formatDeviceCapabilityApiError(err));
    }
  }

  async function remove() {
    if (!capabilities?.deviceCapabilityDelete) return;
    if (!confirm(`Yakin ingin menghapus capability "${row!.name}"?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteMutation.mutateAsync(row!.id);
      router.push("/device-capabilities");
    } catch (err) {
      setError(formatDeviceCapabilityApiError(err));
    }
  }

  async function submitItem(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.deviceCapabilityItemCreate) return;
    setError(null);
    setSuccess(null);

    if (!itemForm.code.trim()) {
      setError("Kode item wajib diisi.");
      return;
    }
    if (!itemForm.name.trim()) {
      setError("Nama item wajib diisi.");
      return;
    }

    try {
      await createItemMutation.mutateAsync({
        capabilityId: row!.id,
        input: buildDeviceCapabilityItemCreatePayload(itemForm),
      });
      setSuccess("Item berhasil ditambahkan.");
      setAddingItem(false);
      setItemForm(emptyItemForm);
      await capabilityQuery.refetch();
    } catch (err) {
      setError(formatDeviceCapabilityApiError(err));
    }
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    if (!capabilities?.deviceCapabilityItemUpdate || !editingItemId) return;
    setError(null);
    setSuccess(null);

    if (!editItemForm.code.trim()) {
      setError("Kode item wajib diisi.");
      return;
    }
    if (!editItemForm.name.trim()) {
      setError("Nama item wajib diisi.");
      return;
    }

    try {
      await updateItemMutation.mutateAsync({
        capabilityId: row!.id,
        itemId: editingItemId,
        input: buildDeviceCapabilityItemUpdatePayload(editItemForm),
      });
      setSuccess("Item berhasil diubah.");
      setEditingItemId(null);
      await capabilityQuery.refetch();
    } catch (err) {
      setError(formatDeviceCapabilityApiError(err));
    }
  }

  async function removeItem(item: DeviceCapabilityItemRow) {
    if (!capabilities?.deviceCapabilityItemDelete) return;
    if (!confirm(`Yakin ingin menghapus item "${item.name}"?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await deleteItemMutation.mutateAsync({ capabilityId: row!.id, itemId: item.id });
      setSuccess("Item berhasil dihapus.");
      if (editingItemId === item.id) setEditingItemId(null);
      await capabilityQuery.refetch();
    } catch (err) {
      setError(formatDeviceCapabilityApiError(err));
    }
  }

  return (
    <div className={deviceCapabilityFormPageClass}>
      <PageHeader
        title={row.name}
        crumbs={[
          { href: "/", label: "Dashboard" },
          { href: "/device-capabilities", label: "Device Capability" },
          { label: row.code },
        ]}
      />

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}

      <Surface className={deviceCapabilityFormSurfaceClass}>
        <p className="font-mono text-sm text-slate-600">{row.code}</p>

        {editing ? (
          <form onSubmit={save} className="mt-3">
            <DeviceCapabilityFormFields value={form} onChange={setField} />

            <div className={deviceCapabilityFormActionsClass}>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                <Save className="h-4 w-4" />
                {updateMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <dl className="mt-3 space-y-3 text-sm">
              <DetailField label="Kode">
                <span className="font-mono font-medium text-slate-900">{row.code}</span>
              </DetailField>

              <DetailField label="Nama">
                <span className="font-medium text-slate-900">{row.name}</span>
              </DetailField>

              <DetailField label="Deskripsi">
                {row.description ? (
                  <span>{row.description}</span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </DetailField>
            </dl>

            <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
              {capabilities.deviceCapabilityDelete ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={remove}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Menghapus…" : "Hapus"}
                </Button>
              ) : null}
              {capabilities.deviceCapabilityUpdate ? (
                <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              ) : null}
            </div>
          </>
        )}
      </Surface>

      <Surface className={deviceCapabilityFormSurfaceClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Capability Items</h2>
          {capabilities.deviceCapabilityItemCreate && !addingItem ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setAddingItem(true);
                setEditingItemId(null);
                setItemForm(emptyItemForm);
                setError(null);
              }}
            >
              <Plus className="h-4 w-4" />
              Add Item
            </Button>
          ) : null}
        </div>

        {addingItem ? (
          <form onSubmit={submitItem} className="mt-4 rounded-md border border-slate-200 p-4">
            <DeviceCapabilityItemFormFields
              value={itemForm}
              onChange={setItemField}
              capabilityCode={row.code}
              idPrefix="new-item"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAddingItem(false);
                  setItemForm(emptyItemForm);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createItemMutation.isPending}>
                <Save className="h-4 w-4" />
                {createItemMutation.isPending ? "Saving…" : "Save Item"}
              </Button>
            </div>
          </form>
        ) : null}

        {items.length === 0 && !addingItem ? (
          <p className="mt-4 text-sm text-slate-500">Belum ada item pada capability ini.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Kode</th>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Deskripsi</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="align-top hover:bg-slate-50">
                    {editingItemId === item.id ? (
                      <td colSpan={4} className="px-4 py-3">
                        <form onSubmit={saveItem}>
                          <DeviceCapabilityItemFormFields
                            value={editItemForm}
                            onChange={setEditItemField}
                            capabilityCode={row.code}
                            idPrefix={`edit-item-${item.id}`}
                          />
                          <div className="mt-3 flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setEditingItemId(null)}
                            >
                              Cancel
                            </Button>
                            <Button type="submit" disabled={updateItemMutation.isPending}>
                              <Save className="h-4 w-4" />
                              {updateItemMutation.isPending ? "Saving…" : "Save"}
                            </Button>
                          </div>
                        </form>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{item.code}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {item.description ? (
                            <span className="line-clamp-2">{item.description}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {capabilities.deviceCapabilityItemUpdate ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingItemId(item.id);
                                  setAddingItem(false);
                                  setEditItemForm(itemFormFromRow(item));
                                  setError(null);
                                }}
                              >
                                Edit
                              </Button>
                            ) : null}
                            {capabilities.deviceCapabilityItemDelete ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeItem(item)}
                                disabled={deleteItemMutation.isPending}
                              >
                                Hapus
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}
