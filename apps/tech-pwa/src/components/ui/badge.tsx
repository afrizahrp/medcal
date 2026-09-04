export function Badge({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
