"use client";

import { useEffect } from "react";

/** Tells the page around the iframe (public/embed.js) how tall the content is, so it never scrolls. */
export function EmbedHeight(props: { targetId: string }) {
  useEffect(() => {
    const root = document.getElementById(props.targetId);
    if (!root || window.parent === window) return;
    const report = () =>
      window.parent.postMessage(
        { type: "enaibler:embed-height", height: Math.ceil(root.getBoundingClientRect().height) },
        "*",
      );
    const observer = new ResizeObserver(report);
    observer.observe(root);
    report();
    return () => observer.disconnect();
  }, [props.targetId]);
  return null;
}
