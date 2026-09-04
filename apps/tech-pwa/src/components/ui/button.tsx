"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-brand-700 text-white active:bg-brand-800 disabled:bg-slate-300",
  secondary:
    "border border-slate-300 bg-white text-slate-900 active:bg-slate-100 disabled:border-slate-200 disabled:text-slate-400",
  ghost: "text-slate-700 active:bg-slate-100 disabled:text-slate-400",
};

export function buttonClassName(variant: Variant = "primary", fullWidth = false, className = ""): string {
  return [
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-base font-semibold",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700",
    fullWidth ? "w-full" : "",
    VARIANT_CLASS[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Link styled as a button — for navigation actions that must look like the primary CTA. */
export function LinkButton({
  href,
  variant = "primary",
  fullWidth = false,
  className = "",
  children,
}: {
  href: string;
  variant?: Variant;
  fullWidth?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonClassName(variant, fullWidth, className)}>
      {children}
    </Link>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", fullWidth = false, className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClassName(variant, fullWidth, ["disabled:cursor-not-allowed", className].filter(Boolean).join(" "))}
      {...props}
    />
  );
});
