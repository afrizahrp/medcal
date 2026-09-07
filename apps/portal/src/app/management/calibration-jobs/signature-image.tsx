"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { apiFetchBlob } from "@medcal/shared";
import { Button } from "@/components/ui/button";

/**
 * Renders a signature image stored in the generic FilesModule. Fetches the blob
 * with the session cookie (the file route has no public URL), turns it into an
 * object URL, and revokes it on unmount. PDF attachments are not previewed here
 * — callers show a download affordance instead.
 *
 * Clicking the thumbnail opens a full-size lightbox with an explicit download
 * button — the object URL is already in hand, so the download reuses it
 * directly rather than refetching the blob.
 */
export function SignatureImage({ fileId, alt }: { fileId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setError(false);
    setUrl(null);
    apiFetchBlob(`/files/${fileId}`)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  if (error) {
    return <p className="text-xs text-red-600">Gagal memuat gambar tanda tangan.</p>;
  }
  if (!url) {
    return <p className="text-xs text-slate-400">Memuat gambar…</p>;
  }

  function handleDownload() {
    if (!url) return;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${fileId}.jpg`;
    anchor.click();
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        onClick={() => setLightboxOpen(true)}
        className="max-h-40 cursor-zoom-in rounded border border-slate-200 bg-white object-contain"
      />

      {lightboxOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <div
            className="relative max-h-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute -top-10 right-0 flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-3.5 w-3.5" /> Unduh
              </Button>
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="rounded p-1 text-white hover:bg-white/10"
                aria-label="Tutup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={alt}
              className="max-h-[80vh] max-w-full rounded bg-white object-contain"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
