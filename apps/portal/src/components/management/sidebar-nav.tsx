"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavGroupActive, isNavItemActive, type NavItem } from "../../app/management/nav-config";
import { ChevronIcon, NavIcon } from "./icons";

const itemBase =
  "flex w-full items-center gap-3 rounded-shell px-2.5 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

function itemTone(opts: {
  disabled?: boolean;
  active?: boolean;
  groupActive?: boolean;
  collapsed?: boolean;
  touch?: boolean;
}) {
  return [
    itemBase,
    opts.collapsed ? "justify-center px-0" : "",
    opts.touch && !opts.collapsed ? "min-h-11 py-2.5" : "",
    opts.disabled
      ? "cursor-not-allowed text-slate-400 opacity-60"
      : opts.active
        ? "bg-brand-50 font-medium text-brand-800"
        : opts.groupActive
          ? "bg-slate-50 font-medium text-brand-800"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  ]
    .filter(Boolean)
    .join(" ");
}

function NavLeaf({
  item,
  pathname,
  collapsed,
  depth = 0,
  onNavigate,
  touch,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  depth?: number;
  onNavigate?: () => void;
  touch?: boolean;
}) {
  const active = isNavItemActive(pathname, item);
  const className = itemTone({ disabled: item.disabled, active, collapsed, touch });
  const content = (
    <>
      {item.icon ? <NavIcon name={item.icon} className="h-4 w-4 shrink-0" /> : null}
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && <span className="sr-only">{item.label}</span>}
    </>
  );

  const wrapClass = depth > 0 && !collapsed ? "pl-5" : "";

  if (item.disabled) {
    return (
      <div className={wrapClass}>
        <span className={className} title="Segera hadir" aria-disabled="true">
          {content}
        </span>
      </div>
    );
  }

  return (
    <div className={wrapClass}>
      <Link
        href={item.href}
        className={className}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
      >
        {content}
      </Link>
    </div>
  );
}

function NavGroup({
  item,
  pathname,
  collapsed,
  depth = 0,
  onNavigate,
  touch,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  depth?: number;
  onNavigate?: () => void;
  touch?: boolean;
}) {
  const children = item.children ?? [];
  const groupActive = isNavGroupActive(pathname, item);
  const [open, setOpen] = useState(groupActive);

  useEffect(() => {
    if (groupActive) setOpen(true);
  }, [groupActive]);

  const showChildren = !collapsed && open;
  const wrapClass = depth > 0 && !collapsed ? "pl-5" : "";

  return (
    <div className={wrapClass}>
      <button
        type="button"
        className={itemTone({ groupActive, collapsed, touch })}
        aria-expanded={!collapsed && open}
        title={collapsed ? item.label : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {item.icon ? <NavIcon name={item.icon} className="h-4 w-4 shrink-0" /> : null}
        {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>}
        {!collapsed && (
          <ChevronIcon className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
        )}
        {collapsed && <span className="sr-only">{item.label}</span>}
      </button>
      {showChildren && (
        <div className="mt-0.5 flex flex-col gap-0.5 border-l border-slate-200 ml-4">
          {children.map((child) =>
            renderNavNode(child, {
              pathname,
              collapsed: false,
              depth: depth + 1,
              onNavigate,
              touch,
            }),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Generic recursive node renderer: an item with children is a group
 * (expand/collapse), otherwise a navigable leaf. Not specific to any menu.
 */
function renderNavNode(
  item: NavItem,
  opts: {
    pathname: string;
    collapsed: boolean;
    depth: number;
    onNavigate?: () => void;
    touch?: boolean;
  },
) {
  return item.children?.length ? (
    <NavGroup
      key={item.id ?? item.label}
      item={item}
      pathname={opts.pathname}
      collapsed={opts.collapsed}
      depth={opts.depth}
      onNavigate={opts.onNavigate}
      touch={opts.touch}
    />
  ) : (
    <NavLeaf
      key={item.id ?? item.href}
      item={item}
      pathname={opts.pathname}
      collapsed={opts.collapsed}
      depth={opts.depth}
      onNavigate={opts.onNavigate}
      touch={opts.touch}
    />
  );
}

export function SidebarNav({
  items,
  collapsed,
  onNavigate,
  touch = false,
}: {
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
  touch?: boolean;
}) {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="flex flex-col gap-0.5 px-2 py-2" aria-label="Management">
      {items.map((item) =>
        renderNavNode(item, { pathname, collapsed, depth: 0, onNavigate, touch }),
      )}
    </nav>
  );
}
