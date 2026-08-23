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

type UserStatus = "INVITED" | "ACTIVE" | "DISABLED";
type MembershipRole = "SUPERADMIN" | "ADMIN" | "SUPERVISOR" | "TECHNICIAN" | "FINANCE" | "CUSTOMER";

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
};

const EDITABLE_ROLES: MembershipRole[] = ["ADMIN", "SUPERVISOR", "TECHNICIAN", "FINANCE", "CUSTOMER"];

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

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
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingRole, setUpdatingRole] = useState(false);
  const [updatingNotifications, setUpdatingNotifications] = useState(false);
  const [removingMembership, setRemovingMembership] = useState(false);

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

  async function updateStatus() {
    if (!user || draftStatus === user.status) return;
    setUpdatingStatus(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: draftStatus }),
      });
      setSuccess("Status berhasil diperbarui.");
      await load();
    } catch {
      setError("Gagal memperbarui status.");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function updateRole() {
    if (!user || !user.membership || draftRole === user.membership.role) return;
    setUpdatingRole(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/users/${user.id}/memberships`, {
        method: "PATCH",
        body: JSON.stringify({ role: draftRole }),
      });
      setSuccess("Role berhasil diperbarui.");
      await load();
      if (user.id === currentUser?.id) {
        await invalidateAuthQueries(queryClient, { allNav: true });
      }
    } catch (err) {
      if (err instanceof ApiError && err.data?.code === "SUPERADMIN_PROTECTED") {
        setError("Role SUPERADMIN tidak dapat diubah via aplikasi.");
      } else if (err instanceof ApiError && err.data?.code === "INTERNAL_STAFF_DOMAIN_REQUIRED") {
        setError("Role internal (Admin/Supervisor/Teknisi/Keuangan) hanya untuk email @kalibrasimedika.co.id.");
      } else {
        setError("Gagal memperbarui role.");
      }
    } finally {
      setUpdatingRole(false);
    }
  }

  async function updateNotificationSettings() {
    if (!user?.membership) return;
    if (draftReceiveNotifications === user.membership.receiveNotifications) return;
    setUpdatingNotifications(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/users/${user.id}/memberships/notification-settings`, {
        method: "PATCH",
        body: JSON.stringify({ receiveNotifications: draftReceiveNotifications }),
      });
      setSuccess("Pengaturan notifikasi berhasil diperbarui.");
      await load();
    } catch {
      setError("Gagal memperbarui pengaturan notifikasi.");
    } finally {
      setUpdatingNotifications(false);
    }
  }

  async function removeMembership() {
    if (!user || !user.membership) return;
    if (!confirm("Yakin ingin menghapus membership user ini?")) return;
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
    }
  }

  const isSuperadmin = user?.membership?.role === "SUPERADMIN";
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
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
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
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          {success && <p className="mt-4 text-sm text-emerald-600">{success}</p>}

          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Status User</h2>
            <p className="mt-1 text-xs text-slate-400">
              Status DISABLED akan mencegah user mengakses aplikasi.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <select
                value={draftStatus}
                disabled={updatingStatus}
                onChange={(e) => setDraftStatus(e.target.value as UserStatus)}
                className={`${selectClassName} sm:max-w-xs`}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <Button
                onClick={updateStatus}
                disabled={updatingStatus || draftStatus === user.status}
              >
                <Save className="h-4 w-4" />
                Update Status
              </Button>
            </div>
          </div>

          {user.membership && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Role</h2>
              {isSuperadmin ? (
                <p className="mt-2 text-sm text-slate-500">
                  Role SUPERADMIN tidak dapat diubah melalui aplikasi. Gunakan bootstrap CLI.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-slate-400">
                    Ubah role user di company ini.
                  </p>
                  {!staffEligible && (
                    <p className="mt-1 text-xs text-slate-400">
                      User ini memakai email di luar domain @kalibrasimedika.co.id, jadi hanya role
                      Customer yang tersedia.
                    </p>
                  )}
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <select
                      value={draftRole}
                      disabled={updatingRole}
                      onChange={(e) => setDraftRole(e.target.value as MembershipRole)}
                      className={`${selectClassName} sm:max-w-xs`}
                    >
                      {roleOptions.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <Button
                      onClick={updateRole}
                      disabled={updatingRole || draftRole === user.membership.role}
                    >
                      <Save className="h-4 w-4" />
                      Update Role
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {user.membership && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Notifikasi</h2>
              <p className="mt-1 text-xs text-slate-400">
                User ini dapat menerima notifikasi push untuk assignment yang ditujukan kepadanya di
                company ini.
              </p>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={draftReceiveNotifications}
                    disabled={updatingNotifications}
                    onChange={(e) => setDraftReceiveNotifications(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600"
                  />
                  Terima Notifikasi
                </label>
                <Button
                  onClick={updateNotificationSettings}
                  disabled={
                    updatingNotifications ||
                    draftReceiveNotifications === user.membership.receiveNotifications
                  }
                >
                  <Save className="h-4 w-4" />
                  Simpan
                </Button>
              </div>
            </div>
          )}

          {user.membership && !isSuperadmin && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-6">
              <h2 className="text-base font-semibold text-red-900">Hapus Membership</h2>
              <p className="mt-1 text-sm text-red-700">
                Menghapus membership akan mencabut akses user ke company ini. User masih bisa login tapi tidak bisa mengakses fitur.
              </p>
              <Button
                variant="destructive"
                className="mt-4"
                onClick={removeMembership}
                disabled={removingMembership}
              >
                <Trash2 className="h-4 w-4" />
                Hapus Membership
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
