"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useStudioText } from "@/components/studio/studio-text";

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** The widget's embed code (public/embed.js with data-webinar) and a live preview of it. */
export function WebinarEmbedCode(props: {
  origin: string;
  slug: string;
  lang: string;
  title: string;
  preview: boolean;
}) {
  const t = useStudioText();
  const [copied, setCopied] = useState(false);
  const [height, setHeight] = useState(480);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const data = event.data as { type?: string; height?: number } | null;
      if (data?.type === "enaibler:embed-height" && typeof data.height === "number") {
        setHeight(Math.min(Math.max(Math.ceil(data.height), 160), 3000));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const script = `<script src="${props.origin}/embed.js" data-webinar="${props.slug}" data-lang="${props.lang}" data-utm-source="website" data-title="${escapeAttribute(props.title)}" async></script>`;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{t.t("settings.embed.code")}</p>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(script);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
          {copied ? t.t("common.copied") : t.t("settings.embed.copyCode")}
        </button>
      </div>
      <pre className="overflow-auto whitespace-pre-wrap break-all rounded-control bg-subtle p-3 font-mono text-xs">
        {script}
      </pre>
      {props.preview && (
        <div className="space-y-1">
          <p className="text-sm font-semibold">{t.t("settings.embed.preview")}</p>
          <iframe
            ref={frame}
            src={`${props.origin}/embed/webinars/${props.slug}?lang=${props.lang}&preview=1`}
            title={t.t("settings.embed.previewTitle", { title: props.title })}
            className="block w-full max-w-xl rounded-card border border-line"
            style={{ height }}
          />
        </div>
      )}
    </div>
  );
}
