"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { mapSourceCoverageAction } from "@/app/studio/courses/[courseId]/sources/actions";
import { useStudioText } from "@/components/studio/studio-text";

/** Runs the source coverage check; the page shows the stored map once it is done. */
export function SourceCoverageCheck(props: { courseId: string; again: boolean }) {
  const t = useStudioText();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    const data = new FormData();
    data.set("courseId", props.courseId);
    setError(null);
    startTransition(async () => {
      const result = await mapSourceCoverageAction(data);
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <div className="space-y-2">
      <button type="button" className="btn btn-secondary btn-sm" onClick={run} disabled={pending}>
        <Sparkles aria-hidden size={16} />{" "}
        {pending
          ? t.t("drafts.coverage.running")
          : t.t(props.again ? "drafts.coverage.rerun" : "drafts.coverage.run")}
      </button>
      <div aria-live="polite">
        {error && (
          <p
            role="alert"
            className="text-sm font-semibold"
            style={{ color: "var(--status-critical)" }}
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
