"use client";

import {
  BookOpen,
  ClipboardCheck,
  LayoutDashboard,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS = {
  overview: LayoutDashboard,
  courses: BookOpen,
  reviews: ClipboardCheck,
  people: Users,
  settings: Settings,
} satisfies Record<string, LucideIcon>;

export interface StudioNavItem {
  icon: keyof typeof ICONS;
  href: Route;
  label: string;
  /** Items waiting for the viewer (e.g. reviews to decide). */
  count?: number;
}

export function StudioNav(props: { items: StudioNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Studio">
      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {props.items.map((item) => {
          const active =
            item.href === "/studio" ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = ICONS[item.icon];
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 whitespace-nowrap rounded-control px-3 py-2 text-sm font-semibold ${
                  active ? "bg-primary-soft text-ink" : "text-muted hover:bg-subtle hover:text-ink"
                }`}
              >
                <Icon aria-hidden size={18} />
                <span className="flex-1">{item.label}</span>
                {item.count ? (
                  <span className="badge" data-tone="warning">
                    {item.count}
                    <span className="sr-only"> waiting</span>
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
