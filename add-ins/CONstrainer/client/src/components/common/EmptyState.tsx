import type { ReactNode } from 'react';

type Props = {
  id?: string;
  icon?: ReactNode;
  title: string;
  message?: string;
};

export function EmptyState({ id, icon, title, message }: Props) {
  return (
    <div id={id} className="cs_empty">
      {icon && (
        <div id={id ? `${id}_icon` : undefined} className="cs_emptyIcon">
          {icon}
        </div>
      )}
      <div id={id ? `${id}_title` : undefined} className="cs_emptyTitle">
        {title}
      </div>
      {message && (
        <div id={id ? `${id}_message` : undefined} className="cs_emptyMessage">
          {message}
        </div>
      )}
    </div>
  );
}
