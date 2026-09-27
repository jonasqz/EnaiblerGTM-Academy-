"use client";

import { requestMagicLink, type SignInState } from "@/app/(academy)/sign-in/actions";
import { useActionForm } from "@/components/ui/use-action-form";

export function SignInForm(props: {
  ctx: string | null;
  next: string | null;
  labels: {
    email: string;
    submit: string;
    sending: string;
    sent: string;
    /** The academy's newsletter wording, as on "My learning"; none for the Studio's sign-in. */
    news: string | null;
    newsNext: string;
  };
}) {
  const { state, pending, onSubmit } = useActionForm<SignInState>(requestMagicLink, {
    status: "idle",
  });

  if (state.status === "sent") {
    return (
      <div role="status" className="card space-y-2 p-5">
        <p>{props.labels.sent.replace("{email}", state.email)}</p>
        {state.news && <p className="text-sm text-muted">{props.labels.newsNext}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {props.ctx && <input type="hidden" name="ctx" value={props.ctx} />}
      {props.next && <input type="hidden" name="next" value={props.next} />}
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
      {props.labels.news && (
        <label className="flex items-start gap-3">
          <input type="checkbox" name="news" className="mt-1 size-4 shrink-0" />
          <span className="text-sm">{props.labels.news}</span>
        </label>
      )}
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
