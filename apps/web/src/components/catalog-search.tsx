"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Fuse from "fuse.js";
import { products } from "@/data/catalog";

const fuse = new Fuse(products, {
  keys: ["name"],
  threshold: 0.25,
  ignoreLocation: true,
  minMatchCharLength: 2,
});

export function CatalogSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    return fuse.search(query).slice(0, 8);
  }, [query]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="catalog-search-panel"
        aria-label="Cari alat kalibrasi"
        className="flex h-11 w-11 items-center justify-center rounded-md text-ink-600 hover:bg-brand-50 hover:text-brand-800 md:h-10 md:w-auto md:gap-2 md:rounded-full md:border md:border-ink-200 md:px-4"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
        >
          <circle
            cx="11"
            cy="11"
            r="7"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="m20 20-3.2-3.2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        <span className="hidden text-sm font-medium md:inline">
          Cari alat
        </span>
      </button>

      {open ? (
        <div
          id="catalog-search-panel"
          role="dialog"
          aria-label="Pencarian alat kalibrasi"
          className="absolute inset-x-0 top-full z-50 border-b border-ink-100 bg-white shadow-lg"
        >
          <div className="mx-auto max-w-8xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"
                >
                  <circle
                    cx="11"
                    cy="11"
                    r="7"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="m20 20-3.2-3.2"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari alat, misalnya: autoclave, ventilator, patient monitor…"
                  className="w-full rounded-xl border border-ink-200 py-3 pl-10 pr-3 text-base text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <button
                type="button"
                onClick={close}
                className="shrink-0 rounded-xl px-3 py-3 text-sm font-medium text-ink-500 hover:bg-ink-50"
              >
                Tutup
              </button>
            </div>

            <div className="mt-3 max-h-80 overflow-y-auto">
              {query.trim() === "" ? (
                <p className="px-1 py-3 text-sm text-ink-500">
                  Ketik nama alat yang ingin Anda kalibrasi.
                </p>
              ) : results.length === 0 ? (
                <p className="px-1 py-3 text-sm text-ink-500">
                  Tidak ditemukan. Coba kata kunci lain atau{" "}
                  <Link
                    href="/kontak"
                    onClick={close}
                    className="font-medium text-brand-700 hover:underline"
                  >
                    hubungi kami
                  </Link>
                  .
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {results.map(({ item }) => (
                    <li key={item.name}>
                      <Link
                        href={`/layanan/kalibrasi-${item.categorySlug}`}
                        onClick={close}
                        className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-brand-50"
                      >
                        <span>
                          <span className="block text-sm font-medium text-ink-900">
                            {item.name}
                          </span>
                          <span className="block text-xs text-ink-500">
                            {item.categoryName}
                          </span>
                        </span>
                        {item.accredited ? (
                          <span className="shrink-0 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                            KAN
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
