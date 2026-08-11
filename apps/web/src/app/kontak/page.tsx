import type { Metadata } from "next";
import { KontakForm } from "./kontak-form";

export const metadata: Metadata = {
  title: "Kontak",
  description:
    "Hubungi Presisi Kalibrasi Medika untuk konsultasi kebutuhan kalibrasi alat kesehatan dan laboratorium.",
  alternates: { canonical: "/kontak" },
  openGraph: { url: "/kontak" },
};

export default function KontakPage() {
  return <KontakForm />;
}
