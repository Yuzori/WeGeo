import type { MouseEvent, ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { rememberSettingsFrom } from '../lib/nav';

export function SettingsLink({
  children,
  className,
  title,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const location = useLocation();
  const from = `${location.pathname}${location.search}${location.hash}`;

  return (
    <Link
      to="/app/compte"
      state={{ from }}
      className={className}
      title={title}
      aria-label={title}
      onClick={(event) => {
        rememberSettingsFrom(from);
        onClick?.(event);
      }}
    >
      {children}
    </Link>
  );
}
