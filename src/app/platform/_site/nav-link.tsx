"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** A link in the site's navigation that marks the page you are on. */
export function NavLink(props: { href: string; className?: string; children: ReactNode }) {
  const current = usePathname() === props.href;
  return (
    <a href={props.href} aria-current={current ? "page" : undefined} className={props.className}>
      {props.children}
    </a>
  );
}
