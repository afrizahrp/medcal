"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import logo from "../../../public/logo.png";

export function AuthCard({
  title,
  children,
  footerLabel,
  footerHref,
  footerLinkText,
}: {
  title: string;
  children: ReactNode;
  footerLabel: string;
  footerHref: string;
  footerLinkText: string;
}) {
  return (
    <div className="w-full max-w-[95vw] min-w-[320px] rounded-shell bg-white px-4 py-6 shadow-md sm:px-6 md:w-[400px] md:px-8">
      <div className="mb-4 flex flex-col items-center text-center">
        <Image
          src={logo}
          alt="MedCal"
          width={80}
          height={80}
          className="h-20 w-20 object-contain"
          priority
        />
        <h1 className="-mt-1 text-base font-semibold text-brand-800">
          {title}
        </h1>
      </div>
      {children}
      <p className="mt-5 text-center text-sm text-slate-600">
        {footerLabel}{" "}
        <Link
          href={footerHref}
          className="font-medium text-brand-700 hover:underline"
        >
          {footerLinkText}
        </Link>
      </p>
    </div>
  );
}
