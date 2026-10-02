"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import logo from "../../../public/logo.png";
import { linkAction } from "../../lib/ui-classes";

export function AuthCard({
  title,
  subtitle,
  children,
  footerLabel,
  footerHref,
  footerLinkText,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footerLabel: string;
  footerHref: string;
  footerLinkText: string;
}) {
  return (
    <div className="w-full max-w-sm rounded-2xl bg-white px-5 py-7 shadow-sm sm:px-7">
      <div className="mb-5 flex flex-col items-center text-center">
        <Image
          src={logo}
          alt="PT. Presisi Kalibrasi Medika"
          width={180}
          height={72}
          className="h-14 w-auto object-contain"
          priority
        />
        <h1 className="mt-2 text-lg font-semibold text-brand-800">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {children}
      <p className="mt-4 flex flex-wrap items-center justify-center gap-x-1 text-center text-sm text-slate-600">
        {footerLabel}
        <Link href={footerHref} className={linkAction}>
          {footerLinkText}
        </Link>
      </p>
    </div>
  );
}
