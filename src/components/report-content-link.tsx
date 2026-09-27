"use client";

import { usePathname } from "next/navigation";

import { reportContentHref } from "@/core/platform/report";

/**
 * "Report content" in an academy's footer (DSA Art. 16). The footer belongs to
 * the layout, which stays put while learners move between pages, so the
 * page's address is read here, on every navigation.
 */
export function ReportContentLink(props: {
  platformOrigin: string;
  pageOrigin: string;
  label: string;
  className?: string;
}) {
  const pathname = usePathname();
  const href = reportContentHref(props.platformOrigin, {
    origin: props.pageOrigin,
    pathname: pathname ?? "/",
  });
  if (!href) return null;
  return (
    <a href={href} rel="nofollow" className={props.className}>
      {props.label}
    </a>
  );
}
