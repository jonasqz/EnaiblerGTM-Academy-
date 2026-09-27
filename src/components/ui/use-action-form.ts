"use client";

import { useActionState, useTransition, type FormEvent } from "react";

/**
 * useActionState for forms that must keep their input. React resets a form
 * whose `action` prop is a function after every completed action, including
 * one that only returned a validation error; submitting through onSubmit
 * avoids that, so nobody loses what they typed.
 */
export function useActionForm<State>(
  action: (state: Awaited<State>, formData: FormData) => State | Promise<State>,
  initial: Awaited<State>,
) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const [, startTransition] = useTransition();
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };
  return { state, pending, onSubmit };
}
