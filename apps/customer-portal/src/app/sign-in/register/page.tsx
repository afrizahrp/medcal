"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@medcal/auth/client";
import { AuthCard } from "../../../components/auth/auth-card";
import { NETWORK_ERROR_MESSAGE, signUpErrorMessage } from "../../../lib/auth-messages";
import { sanitizeReturnTo } from "../../../lib/return-to";
import { buttonPrimary, fieldClass } from "../../../lib/ui-classes";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    if (password !== confirmPassword) {
      setError("Kata sandi dan konfirmasi tidak sama.");
      return;
    }

    setSubmitting(true);
    // Real browser call — Origin is set automatically by the browser from
    // this page's actual origin (customer.*) and read server-side by
    // registration-origin.hook.ts to resolve CUSTOMER_PORTAL context. No
    // application code can or should override it — see
    // registration-origin-callers.test.ts's ALLOWLISTED_FILES entry for this
    // file.
    let signUpError: Awaited<ReturnType<typeof authClient.signUp.email>>["error"];
    try {
      ({ error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name,
      }));
    } catch {
      setSubmitting(false);
      setError(NETWORK_ERROR_MESSAGE);
      return;
    }
    setSubmitting(false);

    if (signUpError) {
      setError(signUpErrorMessage(signUpError));
      return;
    }

    const destination = sanitizeReturnTo(searchParams.get("returnTo"));
    router.push(destination);
    router.refresh();
  }

  const returnToParam = searchParams.get("returnTo");
  const signInHref = returnToParam
    ? `/sign-in?returnTo=${encodeURIComponent(returnToParam)}`
    : "/sign-in";

  return (
    <AuthCard
      title="Buat akun pelanggan"
      subtitle="PT. Presisi Kalibrasi Medika"
      footerLabel="Sudah punya akun?"
      footerHref={signInHref}
      footerLinkText="Masuk"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="name">
            Nama
          </label>
          <input
            id="name"
            type="text"
            required
            autoComplete="name"
            placeholder="Nama lengkap Anda"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={fieldClass}
          />
        </div>
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
              autoComplete="new-password"
              placeholder="Buat kata sandi"
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
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="confirmPassword">
            Konfirmasi kata sandi
          </label>
          <input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="new-password"
            placeholder="Ulangi kata sandi"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            className={fieldClass}
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} className={`${buttonPrimary} w-full text-base`}>
          {submitting ? "Memproses…" : "Daftar"}
        </button>
      </form>
    </AuthCard>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
