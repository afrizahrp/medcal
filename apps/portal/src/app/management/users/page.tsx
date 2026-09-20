"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, UserPlus, Users } from "lucide-react";
import { apiFetch, isForbidden } from "@medcal/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SortableTh } from "@/components/ui/sortable-th";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useTableSort } from "@/hooks/use-table-sort";
import { useUrlQueryState } from "@/hooks/use-url-query-state";
import { AccessDenied } from "../../../components/access-denied";

type UserStatus = "INVITED" | "ACTIVE" | "DISABLED";
type MembershipRole =
  | "SUPERADMIN"
  | "ADMIN"
  | "SUPERVISOR"
  | "TECHNICIAN"
  | "TECHNICIAN_MANAGER"
  | "FINANCE"
  | "CUSTOMER"
  | "CUSTOMER_SERVICE"
  | "GENERAL_MANAGER";

interface UserListRow {
  id: string;
  email: string;
  name: string | null;
  status: UserStatus;
  membership: {
    role: MembershipRole;
    isDefault: boolean;
  } | null;
  createdAt: string;
}

interface UserListResult {
  data: UserListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const STATUS_LABELS: Record<UserStatus, string> = {
  INVITED: "Diundang",
  ACTIVE: "Aktif",
  DISABLED: "Dinonaktifkan",
};

const STATUS_COLORS: Record<UserStatus, string> = {
  INVITED: "bg-amber-100 text-amber-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  DISABLED: "bg-slate-100 text-slate-600",
};

const ROLE_LABELS: Record<MembershipRole, string> = {
  SUPERADMIN: "Super Admin",
  ADMIN: "Admin",
  SUPERVISOR: "Supervisor",
  TECHNICIAN: "Teknisi",
  TECHNICIAN_MANAGER: "Manajer Teknisi",
  FINANCE: "Keuangan",
  CUSTOMER: "Customer",
  CUSTOMER_SERVICE: "Customer Service",
  GENERAL_MANAGER: "General Manager",
};

const URL_KEYS = ["search", "sortBy", "sortDir", "page"] as const;

export default function UsersPage() {
  const { params, setParams } = useUrlQueryState(URL_KEYS);

  const sort = useTableSort(params, setParams, "createdAt");
  const { sortBy, sortDir } = sort;
  const page = Number(params.page) || 1;
  const committedSearch = params.search ?? "";

  const [users, setUsers] = useState<UserListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [searchInput, setSearchInput] = useState(committedSearch);
  const debouncedSearch = useDebouncedValue(searchInput, 500);

  useEffect(() => {
    if (debouncedSearch !== committedSearch) {
      setParams({ search: debouncedSearch || undefined, page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const qs = new URLSearchParams();
      qs.set("page", String(page));
      qs.set("pageSize", "10");
      qs.set("sortBy", sortBy);
      qs.set("sortDir", sortDir);
      if (committedSearch) qs.set("search", committedSearch);

      const result = await apiFetch<UserListResult>(`/users?${qs.toString()}`);
      setUsers(result.data);
      setTotalPages(result.totalPages);
      setTotal(result.total);
    } catch (err) {
      if (isForbidden(err)) {
        setForbidden(true);
      } else {
        setError("Gagal memuat daftar user.");
      }
    } finally {
      setLoading(false);
    }
  }, [page, committedSearch, sortBy, sortDir]);

  useEffect(() => {
    load();
  }, [load]);

  if (forbidden) {
    return <AccessDenied />;
  }

  return (
    <div className="w-full px-4 py-6 md:px-6 md:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Users</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola pengguna dan akses aplikasi</p>
        </div>
        <Link href="/users/assign">
          <Button>
            <UserPlus className="h-4 w-4" />
            Assign User
          </Button>
        </Link>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="text"
              placeholder="Cari nama atau email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {error && <p className="p-4 text-sm text-red-600">{error}</p>}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-slate-400">Memuat...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">Belum ada user</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                    <SortableTh field="name" label="User" sort={sort} />
                    <th className="px-4 py-3">Role</th>
                    <SortableTh field="status" label="Status" sort={sort} />
                    <SortableTh field="createdAt" label="Tanggal Dibuat" sort={sort} />
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-slate-900">{user.name || "—"}</p>
                          <p className="text-sm text-slate-500">{user.email}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {user.membership ? (
                          <Badge variant="secondary">{ROLE_LABELS[user.membership.role]}</Badge>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={STATUS_COLORS[user.status]}>
                          {STATUS_LABELS[user.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {new Date(user.createdAt).toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/users/${user.id}`}>
                          <Button variant="ghost" size="sm">
                            Detail
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
              <p className="text-sm text-slate-500">
                Menampilkan {users.length} dari {total} user
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setParams({ page: page - 1 <= 1 ? undefined : String(page - 1) })}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setParams({ page: String(page + 1) })}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
