"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import logo from "../../../public/logo.png";

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
          alt="PKM"
          width={180}
          height={72}
          className="h-14 w-auto object-contain"
          priority
        />
        <h1 className="mt-2 text-lg font-semibold text-brand-800">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {children}
      <p className="mt-6 text-center text-sm text-slate-600">
        {footerLabel}{" "}
        <Link href={footerHref} className="font-medium text-brand-700 active:underline">
          {footerLinkText}
        </Link>
      </p>
    </div>
  );
}
