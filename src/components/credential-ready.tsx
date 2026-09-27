import { Award, Share2 } from "lucide-react";
import Link from "next/link";

import { Notice } from "@/components/ui/notice";

export interface CredentialReadyLabels {
  title: string;
  /** "It stays private until you choose to share it." */
  private: string;
  share: string;
  view: string;
}

/**
 * The pass moment (brief §2 steps 6–7): the credential is ready, and sharing
 * it is the next step. The share panel sits at the top of its page.
 */
export function CredentialReady(props: {
  publicId: string;
  isPublic: boolean;
  levelLine?: string | null;
  labels: CredentialReadyLabels;
}) {
  const { labels } = props;
  return (
    <Notice tone="good" title={labels.title}>
      <div className="space-y-3">
        {props.levelLine && <p className="font-semibold">{props.levelLine}</p>}
        {!props.isPublic && <p>{labels.private}</p>}
        <div className="flex flex-wrap gap-2">
          <Link href={`/verify/${props.publicId}#share`} className="btn btn-primary btn-sm">
            <Share2 aria-hidden size={16} /> {labels.share}
          </Link>
          <Link href={`/verify/${props.publicId}#credential`} className="btn btn-secondary btn-sm">
            <Award aria-hidden size={16} /> {labels.view}
          </Link>
        </div>
      </div>
    </Notice>
  );
}
