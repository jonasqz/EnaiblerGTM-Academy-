"use client";

import { useActionState } from "react";

import { requestMagicLink, type SignInState } from "@/app/sign-in/actions";

export function SignInForm(props: {
  ctx: string | null;
  labels: { email: string; submit: string; sending: string; sent: string };
}) {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestMagicLink, {
    status: "idle",
  });

  if (state.status === "sent") {
    return (
      <p role="status" className="card p-5">
        {props.labels.sent.replace("{email}", state.email)}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {props.ctx && <input type="hidden" name="ctx" value={props.ctx} />}
      <label className="block space-y-2">
        <span className="block font-semibold">{props.labels.email}</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          className="w-full rounded-card border-outline border-line bg-card px-4 py-3"
        />
      </label>
      {state.status === "error" && (
        <p role="alert" className="text-sm font-semibold">
          {state.message}
        </p>
      )}
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? props.labels.sending : props.labels.submit}
      </button>
    </form>
  );
}
