"use client";

import { useEffect, useState } from "react";
import { apiFetchBlob } from "@medcal/shared";

/**
 * Rebuilt locally (mirrors Portal's SignatureImage) — fetches a FilesModule
 * blob with the session cookie and renders it as an object URL.
 */
export function SignatureImage({ fileId, alt }: { fileId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

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
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className="max-h-40 rounded border border-slate-200 bg-white object-contain" />
  );
}
