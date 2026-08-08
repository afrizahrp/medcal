"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { company, primaryNav } from "@/data/site";
import { CatalogSearch } from "@/components/catalog-search";
import { SectionCta } from "@/components/section-cta";
import logo from "../../public/logo.jpeg";

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-100 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="relative mx-auto flex h-16 max-w-8xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center">
          <Image
            src={logo}
            alt="Presisi Kalibrasi Medika"
            className="h-11 w-auto sm:h-12"
            priority
          />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {primaryNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-ink-600 hover:bg-brand-50 hover:text-brand-800"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          <CatalogSearch />

          <div className="hidden md:block">
            <SectionCta variant="nav" />
          </div>

          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Tutup menu" : "Buka menu"}
            onClick={() => setOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-md text-ink-700 md:hidden"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              {open ? (
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          className="border-t border-ink-100 bg-white px-4 pb-4 pt-2 md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-3 text-base font-medium text-ink-700 hover:bg-brand-50"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <SectionCta
            variant="nav"
            className="mt-3 flex w-full items-center justify-center rounded-full bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm"
            onCtaClick={() => setOpen(false)}
          />
          <a
            href={`tel:${company.phoneRaw}`}
            className="mt-2 flex w-full items-center justify-center rounded-full border border-ink-200 px-4 py-3 text-sm font-semibold text-ink-700"
          >
            Telepon {company.phoneDisplay}
          </a>
        </nav>
      ) : null}
    </header>
  );
}
