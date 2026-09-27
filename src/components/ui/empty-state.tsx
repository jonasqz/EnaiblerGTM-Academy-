import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState(props: {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = props.icon;
  return (
    <div className="card-flat flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-card bg-primary-soft">
        <Icon aria-hidden size={24} />
      </span>
      <p className="font-semibold">{props.title}</p>
      {props.body && <p className="max-w-md text-sm text-muted">{props.body}</p>}
      {props.action}
    </div>
  );
}
