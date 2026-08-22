"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "@medcal/auth/client";
import { AuthCard } from "../../components/auth/auth-card";

const fieldClass =
  "mt-1 h-11 w-full rounded-shell border border-slate-300 bg-white px-3 text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-600";

export default function SignInPage() {
  const router = useRouter();
  // Mounting useSession() here (rather than only downstream in
  // useRequireSession) subscribes to Better Auth's client session store
  // before signIn.email() runs, so the store's post-sign-in signal refresh
  // has a listener attached in time instead of racing an onMount fetch on
  // the destination route.
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (session) {
      router.replace("/");
      router.refresh();
    }
  }, [session, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const { error: signInError } = await signIn.email({ email, password });

      if (signInError) {
        setSubmitting(false);
        setError(signInError.message ?? "Sign-in failed");
        return;
      }
    } catch {
      setSubmitting(false);
      setError("Cannot reach the API. Make sure pnpm dev is running and http://localhost:3001 is up.");
      return;
    }

    // Success: leave submitting=true. Navigation is driven by the session
    // effect above once Better Auth's store confirms the new session,
    // rather than navigating optimistically before the store settles.
  }

  return (
    <AuthCard
      title="PT. Presisi Kalibrasi Medika"
      footerLabel="Don't have an account?"
      footerHref="/sign-in/register"
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
              className="absolute inset-y-0 right-2 my-auto text-xs font-medium text-brand-700 hover:underline"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="h-11 w-full rounded-shell bg-brand-800 px-3 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </AuthCard>
  );
}
