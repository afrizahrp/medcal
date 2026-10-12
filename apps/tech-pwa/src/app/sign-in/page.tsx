"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@medcal/auth/client";
import { AuthCard } from "../../components/auth/auth-card";
import { recoverPendingBrowserTokenDelete } from "../../lib/fcm/messaging";

const fieldClass =
  "mt-1 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-600";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Finish a browser FCM-token deletion that failed at the previous sign-out,
  // before anyone signs in on this device.
  useEffect(() => {
    void recoverPendingBrowserTokenDelete();
  }, []);

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

    router.push("/");
    router.refresh();
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
