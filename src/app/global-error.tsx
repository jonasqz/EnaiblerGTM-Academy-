"use client";

/**
 * Last resort when even the root layout failed: no theme, no translator, so
 * both languages and plain styles. The server has reported the error.
 */
export default function GlobalError(props: { reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeContent: "center",
          minHeight: "100dvh",
          margin: 0,
          textAlign: "center",
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24 }}>Something went wrong</h1>
        <p lang="de" style={{ margin: 0 }}>
          Da ist etwas schiefgelaufen.
        </p>
        <button
          type="button"
          onClick={() => props.reset()}
          style={{ font: "inherit", padding: "8px 16px", cursor: "pointer" }}
        >
          Try again · Nochmal versuchen
        </button>
      </body>
    </html>
  );
}
