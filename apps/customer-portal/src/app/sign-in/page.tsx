"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@medcal/auth/client";
import { AuthCard } from "../../components/auth/auth-card";
import { sanitizeReturnTo } from "../../lib/return-to";

const fieldClass =
  "mt-1 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-600";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await signIn.email({ email, password });

    setSubmitting(false);
    if (signInError) {
      setError(signInError.message ?? "Sign-in failed");
      return;
    }

    const destination = sanitizeReturnTo(searchParams.get("returnTo"));
    router.push(destination);
    router.refresh();
  }

  // Preserves returnTo across the sign-in <-> register hop, so a deep link
  // followed by "I don't have an account yet" still round-trips correctly.
  const returnToParam = searchParams.get("returnTo");
  const registerHref = returnToParam
    ? `/sign-in/register?returnTo=${encodeURIComponent(returnToParam)}`
    : "/sign-in/register";

  return (
    <AuthCard
      title="Customer Portal"
      subtitle="PT. Presisi Kalibrasi Medika"
      footerLabel="Don't have an account?"
      footerHref={registerHref}
      footerLinkText="Sign up"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            placeholder="Please input your email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="Please input your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${fieldClass} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute inset-y-0 right-2 my-auto text-xs font-medium text-brand-700 active:underline"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 w-full rounded-lg bg-brand-700 px-3 text-base font-semibold text-white active:bg-brand-800 disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
