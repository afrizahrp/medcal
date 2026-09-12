"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavItem } from "../../app/management/nav-config";
import { isNavGroupActive } from "../../app/management/nav-config";

/**
 * Persistent, collapsible orientation panel shown at the top of every
 * "Calibration Management" page. Condensed from the approved draft in
 * docs/module-specs/calibration-job/CalibrationManagement_InfoPanel_Content_Proposal.md §7 —
 * one line per menu leaf, aimed at ~15-second orientation, not full docs.
 *
 * Same pattern as DeviceManagementInfoPanel. Expanded/collapsed state is plain
 * component state: it survives in-app navigation between Calibration Management
 * pages (the management layout stays mounted) and resets on a full page reload.
 * No persistence by design.
 */

const GROUP_LABEL = "Calibration Management";

const INTRO =
  "Bagian ini mengelola alur operasional kalibrasi: tarif, customer, permintaan, " +
  "dokumen komersial, Work Order, hingga Calibration Job per unit alat.";

const ITEMS: { term: string; desc: string }[] = [
  {
    term: "Tariff",
    desc: "Harga per Device Name yang menjadi acuan saat membuat Quotation.",
  },
  {
    term: "Customer",
    desc: "Data customer yang meminta kalibrasi.",
  },
  {
    term: "Requisition",
    desc: "Permintaan kalibrasi dari customer (Device Name, jumlah, On Site / In Lab).",
  },
  {
    term: "Quotation",
    desc: "Penawaran harga dari Requisition; dibuat dari Requisition, bukan berdiri sendiri.",
  },
  {
    term: "Purchase Order",
    desc: "Pencatatan PO customer terhadap Quotation yang sudah disetujui.",
  },
  {
    term: "Work Order",
    desc: "SPK/WOL operasional: assign teknisi, jadwal, dan (On Site) equipment dibawa serta Surat Jalan Alat.",
  },
  {
    term: "Calibration Job",
    desc: "Satu unit alat dalam Work Order; dibuat otomatis saat Work Order dimulai.",
  },
];

const WORKFLOW_SEQUENCE =
  "Tariff + Customer → Requisition → Quotation → Purchase Order → Work Order → Calibration Job.";

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

export function CalibrationManagementInfoPanel({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(true);

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
              Panduan Calibration Management
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
                  <span className="font-medium text-slate-800 sm:w-44 sm:shrink-0">{item.term}</span>
                  <span>{item.desc}</span>
                </li>
              ))}
            </ul>

            <p className="text-slate-500">
              <span className="font-medium text-slate-700">Alur kerja:</span> {WORKFLOW_SEQUENCE}
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
