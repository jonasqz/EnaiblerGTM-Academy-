"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface TabItem {
  href: Route;
  label: string;
  /** Active only on this exact path (for an index tab); otherwise on the path and below. */
  exact?: boolean;
  count?: number;
}

export function Tabs(props: { items: TabItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav className="tabs" aria-label={props.label}>
      {props.items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
            {item.label}
            {item.count !== undefined && <span className="ml-1.5 text-muted">{item.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
