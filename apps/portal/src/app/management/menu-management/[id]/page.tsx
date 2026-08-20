"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MenuForm } from "../menu-form";

export default function EditMenuPage() {
  const params = useParams<{ id: string }>();

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 md:px-6 md:py-5">
      <Link
        href="/menu-management"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Menu Management
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h1 className="text-xl font-semibold text-slate-900">Edit Menu</h1>
        <div className="mt-4">
          <MenuForm menuId={params.id} />
        </div>
      </div>
    </div>
  );
}
