"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Submit button that shows the pending state of its form. With `confirm`, the
 * browser asks first (for deletes and other steps that are hard to undo).
 */
export function SubmitButton(props: {
  children: ReactNode;
  pendingLabel?: ReactNode;
  className?: string;
  confirm?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  title?: string;
  /** For forms submitted through useActionForm (useFormStatus only sees `action` forms). */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = props.pending ?? status.pending;
  return (
    <button
      type="submit"
      name={props.name}
      value={props.value}
      title={props.title}
      aria-label={props.title}
      className={props.className ?? "btn btn-primary"}
      disabled={pending || props.disabled}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (props.confirm && !window.confirm(props.confirm)) event.preventDefault();
      }}
    >
      {pending && props.pendingLabel ? props.pendingLabel : props.children}
    </button>
  );
}
