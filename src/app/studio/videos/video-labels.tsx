import { CircleCheck, CircleX, Globe, Hourglass, Lock, type LucideIcon } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { jobErrorText } from "@/core/i18n/studio/helpers";
import type { StudioText } from "@/core/i18n/studio/translator";
import { isMediaError, type MediaAccess } from "@/core/media/access";
import type { MediaAsset } from "@/server/media/library";

/* How the Studio words a video's kind, status and errors (codes stored, words here). */

export function videoKind(t: StudioText, asset: Pick<MediaAsset, "kind" | "embed" | "sourceId">) {
  if (asset.kind === "external_embed") {
    return asset.embed?.provider === "vimeo" ? t.t("media.kind.vimeo") : t.t("media.kind.youtube");
  }
  return asset.sourceId ? t.t("media.kind.recording") : t.t("media.kind.upload");
}

/** Why preparing a video or its captions failed. */
export function videoError(t: StudioText, code: string | null | undefined): string | null {
  if (!code) return null;
  return isMediaError(code) ? t.t(`media.error.code.${code}`) : jobErrorText(t, code);
}

const STATUS: Record<MediaAsset["status"], { tone: BadgeTone; icon: LucideIcon }> = {
  processing: { tone: "info", icon: Hourglass },
  ready: { tone: "good", icon: CircleCheck },
  failed: { tone: "critical", icon: CircleX },
};

export function VideoStatusBadge(props: { t: StudioText; status: MediaAsset["status"] }) {
  const { tone, icon } = STATUS[props.status];
  return (
    <Badge tone={tone} icon={icon}>
      {props.t.t(`media.status.${props.status}`)}
    </Badge>
  );
}

export function AccessLabel(props: { t: StudioText; access: MediaAccess }) {
  const Icon = props.access === "public" ? Globe : Lock;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden size={14} className="text-muted" />
      {props.t.t(`media.access.${props.access}`)}
    </span>
  );
}
