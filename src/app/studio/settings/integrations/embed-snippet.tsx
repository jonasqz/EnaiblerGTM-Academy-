"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface EmbedLanguage {
  code: string;
  label: string;
  /** The iframe's accessible name in that language. */
  title: string;
}

function CopyButton(props: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        await navigator.clipboard.writeText(props.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
      {copied ? "Copied" : props.label}
    </button>
  );
}

const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Embed code for the path picker, with a live preview in the academy's own look. */
export function EmbedSnippet(props: { origin: string; languages: EmbedLanguage[] }) {
  const [code, setCode] = useState(props.languages[0]!.code);
  const [source, setSource] = useState("website");
  const [heading, setHeading] = useState(true);
  const [previewHeight, setPreviewHeight] = useState(420);
  const preview = useRef<HTMLIFrameElement>(null);
  // The preview grows with its content, as the real embed does (public/embed.js).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== preview.current?.contentWindow) return;
      const data = event.data as { type?: string; height?: number } | null;
      if (data?.type === "enaibler:embed-height" && typeof data.height === "number") {
        setPreviewHeight(Math.min(Math.max(Math.ceil(data.height), 120), 4000));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const language = props.languages.find((entry) => entry.code === code) ?? props.languages[0]!;
  const utmSource = source
    .trim()
    .replace(/[^\p{L}\p{N} ._~:/+-]/gu, "")
    .slice(0, 120);

  const attributes = [
    `src="${props.origin}/embed.js"`,
    `data-lang="${code}"`,
    ...(utmSource ? [`data-utm-source="${escapeAttribute(utmSource)}"`] : []),
    `data-title="${escapeAttribute(language.title)}"`,
    ...(heading ? [] : [`data-heading="off"`]),
  ];
  const script = `<script ${attributes.join(" ")} async></script>`;
  const params = new URLSearchParams({ lang: code });
  if (utmSource) params.set("utm_source", utmSource);
  if (!heading) params.set("heading", "0");
  const frameUrl = `${props.origin}/embed/paths?${params}`;
  const iframe = `<iframe src="${escapeAttribute(frameUrl)}" title="${escapeAttribute(language.title)}" style="display:block;width:100%;height:560px;border:0" loading="lazy"></iframe>`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        {props.languages.length > 1 && (
          <div className="space-y-1">
            <label htmlFor="embed-lang" className="text-sm font-semibold">
              Language
            </label>
            <select
              id="embed-lang"
              className="input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            >
              {props.languages.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="embed-source" className="text-sm font-semibold">
            utm_source
          </label>
          <input
            id="embed-source"
            className="input"
            value={source}
            maxLength={120}
            onChange={(event) => setSource(event.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            checked={heading}
            onChange={(event) => setHeading(event.target.checked)}
          />
          Show heading
        </label>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Embed code</p>
          <CopyButton text={script} label="Copy code" />
        </div>
        <pre className="overflow-auto whitespace-pre-wrap break-all rounded-control bg-subtle p-3 font-mono text-xs">
          {script}
        </pre>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">Without JavaScript</summary>
        <div className="mt-3 space-y-2">
          <p>
            Where your website does not allow scripts, an iframe works too. It does not adjust its
            height, so set one that fits.
          </p>
          <div className="flex justify-end">
            <CopyButton text={iframe} label="Copy iframe" />
          </div>
          <pre className="overflow-auto whitespace-pre-wrap break-all rounded-control bg-subtle p-3 font-mono text-xs">
            {iframe}
          </pre>
        </div>
      </details>

      <div className="space-y-1">
        <p className="text-sm font-semibold">Preview</p>
        <iframe
          ref={preview}
          key={frameUrl}
          src={frameUrl}
          title={`Preview: ${language.title}`}
          className="block w-full rounded-card border border-line"
          style={{ height: previewHeight }}
        />
      </div>
    </div>
  );
}
