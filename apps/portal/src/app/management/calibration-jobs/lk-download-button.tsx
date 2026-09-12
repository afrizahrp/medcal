"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { ApiError } from "@medcal/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadLkResultPdf, requestLkDownloadReauth } from "./use-lk-download-query";

/**
 * "Download LK" button + password re-authentication dialog — LK Result PDF
 * Download v1. Deliberately self-contained: the job detail page only needs
 * to render `<LkDownloadButton jobId={job.id} />` when the job is
 * ACCEPTED_BY_QA; authorization itself is fully enforced server-side
 * (calibrationJob:read + password re-auth + step-up token).
 */
export function LkDownloadButton({ jobId }: { jobId: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPassword("");
    setError(null);
    setPending(false);
  }

  function closeDialog() {
    setOpen(false);
    reset();
  }

  async function handleConfirm() {
    if (!password) {
      setError("Password wajib diisi.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { token } = await requestLkDownloadReauth(jobId, password);
      await downloadLkResultPdf(jobId, token);
      closeDialog();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError("Password salah. Silakan coba lagi.");
      } else {
        setError("Gagal mengunduh LK. Coba lagi.");
      }
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileDown className="h-3.5 w-3.5" />
        Download LK
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Konfirmasi Password</h3>
            <p className="mt-2 text-sm text-slate-600">
              Untuk mengunduh Lembar Kerja (LK), masukkan kembali password akun Anda.
            </p>
            <Input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleConfirm();
              }}
              placeholder="Password"
              className="mt-3"
              disabled={pending}
            />
            {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closeDialog} disabled={pending}>
                Batal
              </Button>
              <Button type="button" onClick={handleConfirm} disabled={pending}>
                {pending ? "Memproses…" : "Unduh LK"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
