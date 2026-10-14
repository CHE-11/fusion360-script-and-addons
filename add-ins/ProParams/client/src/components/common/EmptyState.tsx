import type { ReactNode } from 'react';

type Props = {
  id?: string;
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
};

export function EmptyState({ id, icon, title, message, action }: Props) {
  return (
    <div id={id} className="pp_empty">
      {icon && <div className="pp_emptyIcon">{icon}</div>}
      <div className="pp_emptyTitle">{title}</div>
      {message && <div className="pp_emptyMessage">{message}</div>}
      {action && <div className="pp_emptyAction">{action}</div>}
    </div>
  );
}
