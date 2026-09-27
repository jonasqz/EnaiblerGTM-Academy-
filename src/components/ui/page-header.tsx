import type { ReactNode } from "react";

export function PageHeader(props: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-2">
        {props.eyebrow && <p className="eyebrow">{props.eyebrow}</p>}
        <h1 className="font-display text-2xl leading-tight sm:text-3xl">{props.title}</h1>
        {props.description && <p className="max-w-2xl text-muted">{props.description}</p>}
      </div>
      {props.actions && <div className="flex flex-wrap gap-2">{props.actions}</div>}
    </header>
  );
}
