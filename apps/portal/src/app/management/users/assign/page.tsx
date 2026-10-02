"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UserPlus, Users } from "lucide-react";
import { ApiError, apiFetch, isAllowedRegistrationDomain } from "@medcal/shared";
import { Button } from "@/components/ui/button";

type MembershipRole =
  | "ADMIN"
  | "SUPERVISOR"
  | "TECHNICIAN"
  | "TECHNICIAN_MANAGER"
  | "FINANCE"
  | "CUSTOMER"
  | "CUSTOMER_SERVICE"
  | "GENERAL_MANAGER";

interface UserWithoutMembership {
  id: string;
  email: string;
  name: string | null;
}

// Customers whose Customer.email (PIC Email) equals the selected user's email —
// computed by the API. The server re-checks the match on approval.
interface EligibleCustomer {
  id: string;
  number: string;
  name: string;
  email: string;
  hasPortalUser: boolean;
}

const ROLE_LABELS: Record<MembershipRole, string> = {
  ADMIN: "Admin",
  SUPERVISOR: "Supervisor",
  TECHNICIAN: "Teknisi",
  TECHNICIAN_MANAGER: "Manajer Teknisi",
  FINANCE: "Keuangan",
  CUSTOMER: "Customer",
  CUSTOMER_SERVICE: "Customer Service",
  GENERAL_MANAGER: "General Manager",
};

const ROLE_OPTIONS: MembershipRole[] = [
  "ADMIN",
  "SUPERVISOR",
  "TECHNICIAN",
  "TECHNICIAN_MANAGER",
  "FINANCE",
  "CUSTOMER",
  "CUSTOMER_SERVICE",
  "GENERAL_MANAGER",
];

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export default function AssignUserPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserWithoutMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<MembershipRole>("ADMIN");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [assigning, setAssigning] = useState(false);

  // Only fetched/shown when the CUSTOMER role is selected — this is the
  // explicit staff action that creates the User -> CustomerUserLink ->
  // Customer authorization relationship. The user's email only makes a
  // Customer eligible; staff still choose which one to approve.
  const [eligibleCustomers, setEligibleCustomers] = useState<EligibleCustomer[]>([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<UserWithoutMembership[]>("/users/without-membership");
      setUsers(data);
      if (data.length > 0) {
        setSelectedUserId(data[0].id);
      }
    } catch {
      setError("Gagal memuat daftar user.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;
  // Same domain policy the backend enforces (isAllowedRegistrationDomain,
  // shared from @medcal/shared) — a UX hint only; the server rejects the
  // request regardless of what's shown here.
  const staffEligible = selectedUser ? isAllowedRegistrationDomain(selectedUser.email) : true;
  const roleOptions = staffEligible ? ROLE_OPTIONS : (["CUSTOMER"] as MembershipRole[]);

  useEffect(() => {
    if (!staffEligible && selectedRole !== "CUSTOMER") {
      setSelectedRole("CUSTOMER");
    }
  }, [staffEligible, selectedRole]);

  // Reset the Customer selection whenever it's no longer applicable, so a
  // stale pick from a previous role/user can never be submitted silently.
  useEffect(() => {
    if (selectedRole !== "CUSTOMER") {
      setSelectedCustomerId("");
    }
  }, [selectedRole]);

  useEffect(() => {
    setSelectedCustomerId("");
  }, [selectedUserId]);

  const customerRequired = selectedRole === "CUSTOMER";

  useEffect(() => {
    if (!customerRequired || !selectedUserId) {
      setEligibleCustomers([]);
      return;
    }
    let cancelled = false;
    setEligibleLoading(true);
    apiFetch<EligibleCustomer[]>(`/users/${selectedUserId}/eligible-customers`)
      .then((data) => {
        if (cancelled) return;
        setEligibleCustomers(data);
        // Pre-select only when there is exactly one free match.
        const free = data.filter((customer) => !customer.hasPortalUser);
        if (free.length === 1) setSelectedCustomerId(free[0].id);
      })
      .catch(() => {
        if (!cancelled) {
          setEligibleCustomers([]);
          setError("Gagal memuat Customer yang sesuai dengan email user.");
        }
      })
      .finally(() => {
        if (!cancelled) setEligibleLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerRequired, selectedUserId]);

  const selectedEligible = eligibleCustomers.find((customer) => customer.id === selectedCustomerId);
  const canAssign =
    !!selectedUserId && (!customerRequired || (!!selectedEligible && !selectedEligible.hasPortalUser));

  async function assignMembership() {
    if (!canAssign) return;
    setAssigning(true);
    setError(null);
    try {
      await apiFetch(`/users/${selectedUserId}/memberships`, {
        method: "POST",
        body: JSON.stringify(
          customerRequired
            ? { role: selectedRole, customerId: selectedCustomerId }
            : { role: selectedRole },
        ),
      });
      router.push("/users");
    } catch (err) {
      if (err instanceof ApiError && err.data?.code === "MEMBERSHIP_EXISTS") {
        setError("User sudah memiliki membership di company ini.");
      } else if (err instanceof ApiError && err.data?.code === "INTERNAL_STAFF_DOMAIN_REQUIRED") {
        setError("Role internal (Admin/Supervisor/Teknisi/Keuangan) hanya untuk email @kalibrasimedika.co.id.");
      } else if (err instanceof ApiError && err.data?.code === "CUSTOMER_ID_REQUIRED") {
        setError("Pilih Customer untuk role Customer.");
      } else if (err instanceof ApiError && err.data?.code === "CUSTOMER_NOT_FOUND") {
        setError("Customer yang dipilih tidak ditemukan.");
      } else if (err instanceof ApiError && err.data?.code === "CUSTOMER_EMAIL_MISMATCH") {
        setError("Email user tidak sama dengan Email (PIC) Customer yang dipilih.");
      } else if (err instanceof ApiError && err.data?.code === "CUSTOMER_ALREADY_HAS_PORTAL_USER") {
        setError("Customer ini sudah memiliki user Customer Portal yang disetujui.");
      } else {
        setError("Gagal assign membership.");
      }
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 md:px-8 md:py-8">
      <Link
        href="/users"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke daftar user
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Assign User</h1>
        <p className="mt-1 text-sm text-slate-500">
          Berikan akses ke user yang sudah terdaftar tapi belum memiliki membership di company ini.
        </p>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <p className="mt-6 text-sm text-slate-400">Memuat...</p>
        ) : users.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center py-8">
            <Users className="h-12 w-12 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">
              Tidak ada user tanpa membership. Semua user sudah memiliki akses.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">User</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className={`${selectClassName} mt-1.5`}
                disabled={assigning}
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name ? `${user.name} (${user.email})` : user.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Role</label>
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as MembershipRole)}
                className={`${selectClassName} mt-1.5`}
                disabled={assigning}
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-slate-400">
                Role SUPERADMIN hanya bisa dibuat melalui bootstrap CLI.
              </p>
              {!staffEligible && (
                <p className="mt-1 text-xs text-slate-400">
                  User ini memakai email di luar domain @kalibrasimedika.co.id, jadi hanya role Customer
                  yang tersedia.
                </p>
              )}
            </div>

            {customerRequired && (
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Customer <span className="text-red-500">*</span>
                </label>
                {eligibleLoading ? (
                  <p className="mt-1.5 text-sm text-slate-400">Memuat...</p>
                ) : eligibleCustomers.length === 0 ? (
                  <p className="mt-1.5 text-sm text-amber-700">
                    Tidak ada Customer dengan Email (PIC) yang sama dengan email user ini, jadi user
                    belum dapat disetujui sebagai user Customer Portal.
                  </p>
                ) : (
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className={`${selectClassName} mt-1.5`}
                    disabled={assigning}
                  >
                    <option value="">Pilih Customer…</option>
                    {eligibleCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id} disabled={customer.hasPortalUser}>
                        {customer.number} — {customer.name}
                        {customer.hasPortalUser ? " (sudah punya user portal)" : ""}
                      </option>
                    ))}
                  </select>
                )}
                <p className="mt-1.5 text-xs text-slate-400">
                  Hanya Customer yang Email-nya (PIC) sama dengan email user yang bisa dipilih. Jika
                  beberapa Customer cocok, pilih Customer yang disetujui untuk user ini. Satu Customer
                  hanya boleh memiliki satu user Customer Portal.
                </p>
              </div>
            )}

            <Button onClick={assignMembership} disabled={assigning || !canAssign} className="w-full">
              <UserPlus className="h-4 w-4" />
              Assign Membership
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
