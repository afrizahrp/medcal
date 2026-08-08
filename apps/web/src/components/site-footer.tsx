import Link from "next/link";
import { company, primaryNav, serviceCategories } from "@/data/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-ink-100 bg-white">
      <div className="mx-auto max-w-8xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-base font-bold text-ink-900">
              Presisi Kalibrasi Medika
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              {company.address}
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink-900">Layanan</p>
            <ul className="mt-3 flex flex-col gap-2">
              {serviceCategories.slice(0, 6).map((cat) => (
                <li key={cat.slug}>
                  <Link
                    href={`/layanan/kalibrasi-${cat.slug}`}
                    className="text-sm text-ink-500 hover:text-brand-700"
                  >
                    Kalibrasi {cat.name}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/layanan"
                  className="text-sm font-medium text-brand-700 hover:text-brand-800"
                >
                  Lihat semua layanan →
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink-900">Perusahaan</p>
            <ul className="mt-3 flex flex-col gap-2">
              {primaryNav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-ink-500 hover:text-brand-700"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-ink-900">Kontak</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-ink-500">
              <li>
                <a
                  href={`tel:${company.phoneRaw}`}
                  className="hover:text-brand-700"
                >
                  {company.phoneDisplay}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${company.email}`}
                  className="break-all hover:text-brand-700"
                >
                  {company.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-ink-100 pt-6 text-xs text-ink-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} PT Presisi Kalibrasi Medika. Semua
            hak cipta dilindungi.
          </p>
          <p>Terakreditasi KAN {company.accreditation.number}</p>
        </div>
      </div>
    </footer>
  );
}
