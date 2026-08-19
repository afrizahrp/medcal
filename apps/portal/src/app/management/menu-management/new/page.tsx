"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MenuForm } from "../menu-form";

export default function NewMenuPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-8 md:py-8">
      <Link
        href="/menu-management"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Menu Management
      </Link>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Tambah Menu</h1>
        <div className="mt-6">
          <MenuForm />
        </div>
      </div>
    </div>
  );
}
