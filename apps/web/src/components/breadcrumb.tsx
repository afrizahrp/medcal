import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { breadcrumbListJsonLd } from "@/data/structured-data";

export type BreadcrumbItem = {
  label: string;
  /** Present on every item (including current page) so JSON-LD can share this data. Last item is not linked in the UI. */
  href: string;
};

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <>
      <JsonLd data={breadcrumbListJsonLd(items)} />
      <nav className="text-base text-ink-500" aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            return (
              <li
                key={`${item.label}-${index}`}
                className="inline-flex items-center gap-x-1.5"
              >
                {index > 0 ? <span aria-hidden="true">/</span> : null}
                {!isLast ? (
                  <Link href={item.href} className="hover:text-brand-700">
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-ink-700">{item.label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
