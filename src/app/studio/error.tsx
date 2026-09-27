"use client";

import { ErrorView } from "@/components/ui/error-view";

export default function StudioError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView error={props.error} reset={props.reset} homeHref="/studio" />;
}
