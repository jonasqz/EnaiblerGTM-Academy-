"use client";

import { ErrorView } from "@/components/ui/error-view";

export default function AcademyError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorView error={props.error} reset={props.reset} homeHref="/" />;
}
