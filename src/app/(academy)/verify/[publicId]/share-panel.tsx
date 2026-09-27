import { Download, ExternalLink, Globe, Lock } from "lucide-react";

import {
  agreeToContactAction,
  saveCredentialNameAction,
  setCredentialVisibility,
} from "@/app/(academy)/verify/[publicId]/actions";
import { PostComposer } from "@/app/(academy)/verify/[publicId]/post-composer";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import type { Translator } from "@/core/i18n/translator";

/**
 * The owner's share kit (brief §2 step 7, §6), in the order it happens: the
 * name on the credential, the explicit choice to make it public (nothing is
 * shared before), then LinkedIn. Contact from the academy is a separate,
 * unticked opt-in (brief §9, lead handoff), offered until the learner agrees.
 */
export function SharePanel(props: {
  publicId: string;
  isPublic: boolean;
  hasName: boolean;
  /** Whether the academy lets learners show their work on the page (features.showcase). */
  showcase: boolean;
  /** The suggested post, in the learner's language, linking to the page with ?via=post. */
  post: string;
  /** "ask" until the learner agreed to be contacted; "saved" right after they did. */
  contact: "ask" | "saved" | null;
  academy: string;
  t: Translator;
}) {
  const { publicId, t } = props;
  const shareRoute = `/verify/${publicId}/share`;
  const newTab = <span className="sr-only"> {t.t("embed.newTab")}</span>;
  return (
    <section
      id="share"
      aria-labelledby="share-heading"
      className="card scroll-mt-8 space-y-6 p-5 sm:p-8"
    >
      <h2 id="share-heading" className="font-display text-2xl">
        {t.t("share.title")}
      </h2>

      {!props.hasName && (
        <form action={saveCredentialNameAction} className="space-y-2">
          <input type="hidden" name="publicId" value={publicId} />
          <h3 id="share-name-heading" className="font-semibold">
            {t.t("share.nameTitle")}
          </h3>
          <p id="share-name-hint" className="hint">
            {t.t("me.nameHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              name="displayName"
              required
              maxLength={120}
              autoComplete="name"
              className="input min-w-0 flex-1 basis-56"
              aria-labelledby="share-name-heading"
              aria-describedby="share-name-hint"
            />
            <button type="submit" className="btn btn-secondary">
              {t.t("me.save")}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        <h3 className="font-semibold">{t.t("share.visibilityTitle")}</h3>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
            {props.isPublic ? (
              <Badge tone="good" icon={Globe}>
                {t.t("me.public")}
              </Badge>
            ) : (
              <Badge icon={Lock}>{t.t("me.private")}</Badge>
            )}
            <p className="text-sm">
              {props.isPublic
                ? t.t("verify.publicNotice")
                : t.t(props.showcase ? "share.publicWhatShowcase" : "share.publicWhat")}
            </p>
          </div>
          <form action={setCredentialVisibility}>
            <input type="hidden" name="publicId" value={publicId} />
            <input type="hidden" name="visibility" value={props.isPublic ? "private" : "public"} />
            {props.isPublic ? (
              <button type="submit" className="btn btn-secondary btn-sm">
                {t.t("verify.makePrivate")}
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!props.hasName}
                aria-describedby={props.hasName ? undefined : "share-name-missing"}
              >
                {t.t("verify.makePublic")}
              </button>
            )}
          </form>
        </div>
        {!props.isPublic && !props.hasName && (
          <p id="share-name-missing" className="hint">
            {t.t("me.nameMissing")}
          </p>
        )}
      </div>

      {props.isPublic ? (
        <>
          <div className="space-y-2 border-t border-line pt-5">
            <h3 className="font-semibold">{t.t("share.profileTitle")}</h3>
            <p className="text-sm text-muted">{t.t("share.profileHint")}</p>
            <a
              href={`${shareRoute}?to=profile`}
              target="_blank"
              rel="noopener"
              className="btn btn-primary"
            >
              <ExternalLink aria-hidden size={16} /> {t.t("verify.addToProfile")}
              {newTab}
            </a>
          </div>

          <div className="space-y-2 border-t border-line pt-5">
            <h3 className="font-semibold">{t.t("share.postTitle")}</h3>
            <PostComposer
              suggested={props.post}
              shareHref={`${shareRoute}?to=post`}
              labels={{
                text: t.t("share.postLabel"),
                hint: t.t("share.postHint"),
                copy: t.t("share.copy"),
                open: t.t("share.openLinkedIn"),
                copied: t.t("share.copied"),
                copyFailed: t.t("share.copyFailed"),
                newTab: t.t("embed.newTab"),
              }}
            />
          </div>

          <div className="space-y-2 border-t border-line pt-5">
            <h3 className="font-semibold">{t.t("share.imageTitle")}</h3>
            <p className="text-sm text-muted">{t.t("share.imageHint")}</p>
            <a
              href={`/verify/${publicId}/image?format=card&download=1`}
              download
              className="btn btn-secondary"
            >
              <Download aria-hidden size={16} /> {t.t("share.imageButton")}
            </a>
          </div>
        </>
      ) : (
        <p className="border-t border-line pt-5 text-sm text-muted">
          {t.t("share.linkedInLocked")}
        </p>
      )}

      {props.contact === "saved" && (
        <Notice tone="good" title={t.t("share.contactSaved", { academy: props.academy })} />
      )}
      {props.contact === "ask" && (
        <form action={agreeToContactAction} className="space-y-3 border-t border-line pt-5">
          <input type="hidden" name="publicId" value={publicId} />
          <h3 className="font-semibold">{t.t("me.contactTitle", { academy: props.academy })}</h3>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="optIn" required className="mt-1 size-4 shrink-0" />
            <span className="text-sm">{t.t("me.contactLabel", { academy: props.academy })}</span>
          </label>
          <p className="hint">{t.t("me.contactHint")}</p>
          <button type="submit" className="btn btn-secondary btn-sm">
            {t.t("me.save")}
          </button>
        </form>
      )}
    </section>
  );
}
