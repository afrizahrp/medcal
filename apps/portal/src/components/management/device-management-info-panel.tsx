"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavItem } from "../../app/management/nav-config";
import { isNavGroupActive } from "../../app/management/nav-config";

/**
 * Persistent, collapsible orientation panel shown at the top of every
 * "Device Management" page. Condensed from the approved draft in
 * docs/claude/plans/Calibration-management/DeviceManagement_InfoPanel_Content_Proposal.md §5 —
 * one line per top-level menu, aimed at ~15-second orientation, not full docs.
 *
 * Pilot only — do not extend to other parent menus without a fresh content pass.
 * Expanded/collapsed state is plain component state: it survives in-app
 * navigation between Device Management pages (the management layout stays
 * mounted) and resets on a full page reload. No persistence by design.
 */

const GROUP_LABEL = "Device Management";

const INTRO =
  "Bagian ini berisi data master untuk menyiapkan jenis alat yang dikalibrasi " +
  "lab, pengukuran kalibrasi, pemeriksaan fisik, dan alat standar (referensi).";

const ITEMS: { term: string; desc: string }[] = [
  {
    term: "Categories",
    desc: "Mengelompokkan jenis alat medis.",
  },
  {
    term: "Customer Devices",
    desc: "Mengelola Device customer serta Name Aliases dan Device Name yang digunakan untuk mengenali jenis alat.",
  },
  {
    term: "Models",
    desc: "Referensi merek dan model di bawah suatu Device Name.",
  },
  {
    term: "Capabilities",
    desc: "Mendefinisikan fungsi ukur dan item yang diukur.",
  },
  {
    term: "Calibration Parameters",
    desc: "Menentukan item pengukuran, satuan, dan toleransi untuk suatu Device Name.",
  },
  {
    term: "Physical Inspection",
    desc: "Menentukan checklist kondisi fisik alat; di lapangan dinilai BAIK / TIDAK BAIK. Terpisah dari Calibration Parameters.",
  },
  {
    term: "Reference Equipment",
    desc: "Mengatur jenis dan unit alat standar untuk kalibrasi, termasuk Requirements dan Units.",
  },
];

const SETUP_SEQUENCE =
  "Categories → Device Name → Capabilities → Calibration Parameters + Physical Inspection " +
  "→ Reference Equipment → Name Aliases / Models.";

function findGroup(items: NavItem[], label: string): NavItem | undefined {
  for (const item of items) {
    if (item.label === label && item.children?.length) return item;
    if (item.children?.length) {
      const nested = findGroup(item.children, label);
      if (nested) return nested;
    }
  }
  return undefined;
}

export function DeviceManagementInfoPanel({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);

  const group = findGroup(nav, GROUP_LABEL);
  if (!group || !isNavGroupActive(pathname, group)) return null;

  return (
    <div className="w-full px-4 pt-6 md:px-6">
      <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <h2>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800"
          >
            <span className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              Panduan Device Management
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
            <span className="sr-only">{open ? "Sembunyikan panduan" : "Tampilkan panduan"}</span>
          </button>
        </h2>

        {open ? (
          <div className="space-y-4 border-t border-slate-100 px-4 py-4 text-sm leading-relaxed text-slate-600">
            <p>{INTRO}</p>

            <ul className="space-y-2">
              {ITEMS.map((item) => (
                <li key={item.term} className="sm:flex sm:gap-3">
                  <span className="font-medium text-slate-800 sm:w-44 sm:shrink-0">
                    {item.term}
                  </span>
                  <span>{item.desc}</span>
                </li>
              ))}
            </ul>

            <p className="text-slate-500">
              <span className="font-medium text-slate-700">Menyiapkan jenis alat baru:</span>{" "}
              {SETUP_SEQUENCE} Calibration Parameters dan Physical Inspection dapat disiapkan
              terpisah setelah Device Name tersedia.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
