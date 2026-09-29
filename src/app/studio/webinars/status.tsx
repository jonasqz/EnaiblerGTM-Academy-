import { CircleCheck, CircleSlash, PencilLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { StudioText } from "@/core/i18n/studio/translator";

export function WebinarStatusBadge(props: {
  t: StudioText;
  status: "draft" | "published" | "cancelled";
}) {
  const { t, status } = props;
  if (status === "published") {
    return (
      <Badge tone="good" icon={CircleCheck}>
        {t.t("webinars.status.published")}
      </Badge>
    );
  }
  if (status === "cancelled") {
    return (
      <Badge tone="warning" icon={CircleSlash}>
        {t.t("webinars.status.cancelled")}
      </Badge>
    );
  }
  return <Badge icon={PencilLine}>{t.t("webinars.status.draft")}</Badge>;
}
