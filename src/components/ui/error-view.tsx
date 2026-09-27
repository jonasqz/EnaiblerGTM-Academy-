"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, type ReactNode } from "react";

export interface ErrorText {
  title: string;
  body: string;
  retry: string;
  home: string;
}

const ENGLISH: ErrorText = {
  title: "Something went wrong",
  body: "Please try again. If it keeps happening, come back a little later.",
  retry: "Try again",
  home: "Back to the start",
};

const ErrorTextContext = createContext<ErrorText>(ENGLISH);

/** Layouts hand their error page its words: error.tsx is a client component without the translator. */
export function ErrorTextProvider(props: { text: ErrorText; children: ReactNode }) {
  return <ErrorTextContext value={props.text}>{props.children}</ErrorTextContext>;
}

/**
 * What an error boundary shows. Server errors are reported by the server
 * (they carry a digest); errors that only happened in the browser are sent
 * to /api/client-errors.
 */
export function ErrorView(props: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: "/" | "/studio";
}) {
  const text = useContext(ErrorTextContext);
  const { error } = props;
  useEffect(() => {
    if (error.digest) return;
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: error.name,
        message: error.message,
        stack: error.stack,
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [error]);
  return (
    <div className="mx-auto grid w-full max-w-xl place-content-center gap-4 px-4 py-20 text-center">
      <h1 className="font-display text-3xl">{text.title}</h1>
      <p className="text-muted">{text.body}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" className="btn btn-primary" onClick={() => props.reset()}>
          {text.retry}
        </button>
        <Link href={props.homeHref} className="btn btn-secondary">
          {text.home}
        </Link>
      </div>
    </div>
  );
}
