import Link from "next/link";

export function PageHeader({
  title,
  crumbs,
}: {
  title: string;
  crumbs: { href?: string; label: string }[];
}) {
  return (
    <header>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <nav className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-400" aria-label="Breadcrumb">
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <span aria-hidden="true">›</span> : null}
            {crumb.href ? (
              <Link href={crumb.href} className="transition-colors hover:text-slate-600">
                {crumb.label}
              </Link>
            ) : (
              <span className="text-slate-500">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>
    </header>
  );
}
