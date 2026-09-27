"use client";

import { Copy, ExternalLink } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

export interface PostComposerLabels {
  text: string;
  hint: string;
  copy: string;
  open: string;
  copied: string;
  copyFailed: string;
  newTab: string;
}

const noSubscription = () => () => {};

/**
 * The suggested LinkedIn post (brief §6). LinkedIn cannot prefill a post, so
 * the text goes to the clipboard and the learner pastes it; its composer
 * shows this page's preview. Without JavaScript the text stays selectable and
 * the LinkedIn link still works: only the clipboard needs the script.
 */
export function PostComposer(props: {
  suggested: string;
  /** The share route for a post: records the share, then opens LinkedIn. */
  shareHref: string;
  labels: PostComposerLabels;
}) {
  const { labels } = props;
  const [text, setText] = useState(props.suggested);
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  // False on the server and without a clipboard (e.g. plain http): no button that cannot work.
  const canCopy = useSyncExternalStore(
    noSubscription,
    () => typeof navigator.clipboard?.writeText === "function",
    () => false,
  );

  const copy = () =>
    navigator.clipboard.writeText(text).then(
      () => setStatus("copied"),
      () => setStatus("failed"),
    );

  return (
    <div className="space-y-3">
      <div className="field">
        <label htmlFor="share-post" className="label">
          {labels.text}
        </label>
        <textarea
          id="share-post"
          className="textarea"
          rows={7}
          maxLength={3000}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setStatus("idle");
          }}
          aria-describedby="share-post-hint"
        />
        <p id="share-post-hint" className="hint">
          {labels.hint}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canCopy && (
          <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
            <Copy aria-hidden size={16} /> {labels.copy}
          </button>
        )}
        <a
          href={props.shareHref}
          target="_blank"
          rel="noopener"
          className="btn btn-primary"
          // Copied on the way out: the composer opens in a new tab, this page stays.
          onClick={() => {
            if (canCopy) void copy();
          }}
        >
          <ExternalLink aria-hidden size={16} /> {labels.open}
          <span className="sr-only"> {labels.newTab}</span>
        </a>
      </div>
      <p role="status" aria-live="polite" className="text-sm font-semibold">
        {status === "copied" ? labels.copied : status === "failed" ? labels.copyFailed : ""}
      </p>
    </div>
  );
}
