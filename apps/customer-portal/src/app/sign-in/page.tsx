"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient, signIn, useSession } from "@medcal/auth/client";
import { AuthCard } from "../../components/auth/auth-card";
import { NETWORK_ERROR_MESSAGE, signInErrorMessage } from "../../lib/auth-messages";
import { sanitizeReturnTo } from "../../lib/return-to";
import { buttonPrimary, fieldClass } from "../../lib/ui-classes";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destination = sanitizeReturnTo(searchParams.get("returnTo"));
  const { data: session } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session) return;
    router.replace(destination);
    router.refresh();
  }, [session, destination, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const { error: signInError } = await signIn.email({ email, password });

      if (signInError) {
        setSubmitting(false);
        setError(signInErrorMessage(signInError));
        return;
      }

      const { data } = await authClient.getSession();
      if (!data?.user) {
        setSubmitting(false);
        setError("Berhasil masuk, tetapi sesi belum terbentuk. Silakan coba lagi.");
      }
    } catch {
      setSubmitting(false);
      setError(NETWORK_ERROR_MESSAGE);
    }
  }

  const returnToParam = searchParams.get("returnTo");
  const registerHref = returnToParam
    ? `/sign-in/register?returnTo=${encodeURIComponent(returnToParam)}`
    : "/sign-in/register";

  return (
    <AuthCard
      title="Masuk ke Portal Pelanggan"
      subtitle="PT. Presisi Kalibrasi Medika"
      footerLabel="Belum punya akun?"
      footerHref={registerHref}
      footerLinkText="Daftar"
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
            placeholder="nama@perusahaan.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={fieldClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="password">
            Kata sandi
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="Masukkan kata sandi"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${fieldClass} pr-20`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-1 my-auto h-11 min-w-16 rounded-lg px-2 text-sm font-medium text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
            >
              {showPassword ? "Sembunyikan" : "Tampilkan"}
            </button>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full text-base`}>
          {submitting ? "Memproses…" : "Masuk"}
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
