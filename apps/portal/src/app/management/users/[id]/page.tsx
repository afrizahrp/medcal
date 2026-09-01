"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { ApiError, apiFetch, isAllowedRegistrationDomain, isForbidden } from "@medcal/shared";
import { useAuth, invalidateAuthQueries } from "@medcal/auth/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AccessDenied } from "../../../../components/access-denied";
import { ConfirmDialog } from "../../calibration-requests/calibration-requests-ui";

type UserStatus = "INVITED" | "ACTIVE" | "DISABLED";
type MembershipRole =
  | "SUPERADMIN"
  | "ADMIN"
  | "SUPERVISOR"
  | "TECHNICIAN"
  | "FINANCE"
  | "CUSTOMER"
  | "CUSTOMER_SERVICE";

interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  status: UserStatus;
  membership: {
    role: MembershipRole;
    isDefault: boolean;
    receiveNotifications: boolean;
  } | null;
  createdAt: string;
}

const STATUS_LABELS: Record<UserStatus, string> = {
  INVITED: "Diundang",
  ACTIVE: "Aktif",
  DISABLED: "Dinonaktifkan",
};

const STATUS_OPTIONS: UserStatus[] = ["INVITED", "ACTIVE", "DISABLED"];

const ROLE_LABELS: Record<MembershipRole, string> = {
  SUPERADMIN: "Super Admin",
  ADMIN: "Admin",
  SUPERVISOR: "Supervisor",
  TECHNICIAN: "Teknisi",
  FINANCE: "Keuangan",
  CUSTOMER: "Customer",
  CUSTOMER_SERVICE: "Customer Service",
};

const EDITABLE_ROLES: MembershipRole[] = [
  "ADMIN",
  "SUPERVISOR",
  "TECHNICIAN",
  "FINANCE",
  "CUSTOMER",
  "CUSTOMER_SERVICE",
];

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const pageContainerClass = "mx-auto w-full max-w-[960px] px-4 py-6 md:px-8 md:py-8";

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [draftStatus, setDraftStatus] = useState<UserStatus>("ACTIVE");
  const [draftRole, setDraftRole] = useState<MembershipRole>("ADMIN");
  const [draftReceiveNotifications, setDraftReceiveNotifications] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingMembership, setRemovingMembership] = useState(false);
  const [removeMembershipOpen, setRemoveMembershipOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setNotFound(false);
    setForbidden(false);
    try {
      const data = await apiFetch<UserDetail>(`/users/${params.id}`);
      setUser(data);
      setDraftStatus(data.status);
      if (data.membership) {
        setDraftRole(data.membership.role);
        setDraftReceiveNotifications(data.membership.receiveNotifications);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setNotFound(true);
      } else if (isForbidden(err)) {
        setForbidden(true);
      } else {
        setError("Gagal memuat detail user.");
      }
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  function roleUpdateError(err: unknown): string {
    if (err instanceof ApiError && err.data?.code === "SUPERADMIN_PROTECTED") {
      return "Role SUPERADMIN tidak dapat diubah via aplikasi.";
    }
    if (err instanceof ApiError && err.data?.code === "INTERNAL_STAFF_DOMAIN_REQUIRED") {
      return "Role internal (Admin/Supervisor/Teknisi/Keuangan) hanya untuk email @kalibrasimedika.co.id.";
    }
    return "Gagal memperbarui role.";
  }

  async function saveChanges() {
    if (!user) return;

    const statusChanged = draftStatus !== user.status;
    const roleChanged =
      !!user.membership && !isSuperadmin && draftRole !== user.membership.role;
    const notificationChanged =
      !!user.membership &&
      draftReceiveNotifications !== user.membership.receiveNotifications;

    if (!statusChanged && !roleChanged && !notificationChanged) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    const failures: string[] = [];
    let savedCount = 0;

    if (statusChanged) {
      try {
        await apiFetch(`/users/${user.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: draftStatus }),
        });
        savedCount += 1;
      } catch {
        failures.push("Gagal memperbarui status.");
      }
    }

    if (roleChanged) {
      try {
        await apiFetch(`/users/${user.id}/memberships`, {
          method: "PATCH",
          body: JSON.stringify({ role: draftRole }),
        });
        savedCount += 1;
        if (user.id === currentUser?.id) {
          await invalidateAuthQueries(queryClient, { allNav: true });
        }
      } catch (err) {
        failures.push(roleUpdateError(err));
      }
    }

    if (notificationChanged) {
      try {
        await apiFetch(`/users/${user.id}/memberships/notification-settings`, {
          method: "PATCH",
          body: JSON.stringify({ receiveNotifications: draftReceiveNotifications }),
        });
        savedCount += 1;
      } catch {
        failures.push("Gagal memperbarui pengaturan notifikasi.");
      }
    }

    await load();

    if (failures.length === 0) {
      setSuccess("Perubahan berhasil disimpan.");
    } else if (savedCount > 0) {
      setError(`Sebagian perubahan gagal disimpan. ${failures.join(" ")}`);
    } else {
      setError(failures.join(" "));
    }

    setSaving(false);
  }

  async function removeMembership() {
    if (!user || !user.membership) return;
    setRemovingMembership(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/users/${user.id}/memberships`, { method: "DELETE" });
      setSuccess("Membership berhasil dihapus.");
      if (user.id === currentUser?.id) {
        await invalidateAuthQueries(queryClient, { allNav: true });
      }
      router.push("/users");
    } catch (err) {
      if (err instanceof ApiError && err.data?.code === "SUPERADMIN_PROTECTED") {
        setError("Membership SUPERADMIN tidak dapat dihapus via aplikasi.");
      } else {
        setError("Gagal menghapus membership.");
      }
    } finally {
      setRemovingMembership(false);
      setRemoveMembershipOpen(false);
    }
  }

  const isSuperadmin = user?.membership?.role === "SUPERADMIN";
  const hasUnsavedChanges =
    !!user &&
    (draftStatus !== user.status ||
      (!!user.membership && !isSuperadmin && draftRole !== user.membership.role) ||
      (!!user.membership &&
        draftReceiveNotifications !== user.membership.receiveNotifications));
  // Same domain policy the backend enforces (isAllowedRegistrationDomain,
  // shared from @medcal/shared) — a UX hint only; the server rejects the
  // request regardless of what's shown here.
  const staffEligible = user ? isAllowedRegistrationDomain(user.email) : true;
  // Ineligible users only get CUSTOMER as a selectable target, but the
  // dropdown still includes the current role (if it's an internal one) so
  // an already-grandfathered assignment isn't silently forced to change
  // just by opening this page.
  const roleOptions = staffEligible
    ? EDITABLE_ROLES
    : Array.from(
        new Set<MembershipRole>([
          ...(user?.membership?.role && user.membership.role !== "SUPERADMIN" ? [user.membership.role] : []),
          "CUSTOMER",
        ]),
      );

  if (forbidden) {
    return <AccessDenied />;
  }

  return (
    <div className={pageContainerClass}>
      <Link
        href="/users"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke daftar user
      </Link>

      {notFound ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">User tidak ditemukan</h1>
          <p className="mt-2 text-sm text-slate-500">User yang Anda cari tidak ditemukan atau tidak memiliki akses di company ini.</p>
        </div>
      ) : error && !user ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : !user ? (
        <p className="text-sm text-slate-400">Memuat...</p>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-slate-900">{user.name || "—"}</h1>
            <p className="mt-1 text-sm text-slate-500">{user.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {user.membership && (
                <Badge variant="secondary">{ROLE_LABELS[user.membership.role]}</Badge>
              )}
              <Badge variant="outline">{STATUS_LABELS[user.status]}</Badge>
            </div>

            <div className="mt-6 border-t border-slate-100 pt-6">
              <h2 className="text-base font-semibold text-slate-900">Membership Settings</h2>
              <p className="mt-1 text-xs text-slate-400">
                Pengaturan status, role, dan notifikasi untuk membership user di company ini.
              </p>

              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {user.membership && (
                    <div>
                      <p className="text-sm font-medium text-slate-700">Role</p>
                      {isSuperadmin ? (
                        <>
                          <p className="mt-2 text-sm text-slate-700">{ROLE_LABELS[user.membership.role]}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            Role SUPERADMIN tidak dapat diubah melalui aplikasi. Gunakan bootstrap CLI.
                          </p>
                        </>
                      ) : (
                        <>
                          <select
                            value={draftRole}
                            disabled={saving}
                            onChange={(e) => setDraftRole(e.target.value as MembershipRole)}
                            className={`${selectClassName} mt-2`}
                          >
                            {roleOptions.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                          <p className="mt-1 text-xs text-slate-400">
                            Ubah role user di company ini.
                          </p>
                          {!staffEligible && (
                            <p className="mt-1 text-xs text-slate-400">
                              User ini memakai email di luar domain @kalibrasimedika.co.id, jadi hanya
                              role Customer yang tersedia.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-sm font-medium text-slate-700">Status</p>
                    <select
                      value={draftStatus}
                      disabled={saving}
                      onChange={(e) => setDraftStatus(e.target.value as UserStatus)}
                      className={`${selectClassName} mt-2`}
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-slate-400">
                      Status DISABLED akan mencegah user mengakses aplikasi.
                    </p>
                  </div>
                </div>

                {user.membership && (
                  <div>
                    <p className="text-sm font-medium text-slate-700">Notifikasi</p>
                    <label className="mt-2 flex items-center gap-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={draftReceiveNotifications}
                        disabled={saving}
                        onChange={(e) => setDraftReceiveNotifications(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
                      />
                      Terima Notifikasi
                    </label>
                    <p className="mt-1 text-xs text-slate-400">
                      User ini dapat menerima notifikasi push untuk assignment yang ditujukan
                      kepadanya di company ini.
                    </p>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <Button onClick={saveChanges} disabled={saving || !hasUnsavedChanges}>
                    <Save className="h-4 w-4" />
                    Simpan Perubahan
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          {success && <p className="mt-4 text-sm text-emerald-600">{success}</p>}

          {user.membership && !isSuperadmin && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6">
              <h2 className="text-base font-semibold text-red-900">Danger Zone</h2>
              <p className="mt-1 text-sm text-red-700">
                Menghapus membership akan mencabut akses user ke company ini. User masih bisa login
                tapi tidak bisa mengakses fitur.
              </p>
              <div className="mt-4 flex justify-end">
                <Button
                  variant="destructive"
                  onClick={() => setRemoveMembershipOpen(true)}
                  disabled={removingMembership}
                >
                  <Trash2 className="h-4 w-4" />
                  Hapus Membership
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={removeMembershipOpen}
        title="Hapus Membership"
        description="Yakin ingin menghapus membership user ini? Akses user ke company ini akan dicabut."
        confirmLabel="Hapus Membership"
        variant="destructive"
        loading={removingMembership}
        onConfirm={removeMembership}
        onCancel={() => setRemoveMembershipOpen(false)}
      />
    </div>
  );
}
