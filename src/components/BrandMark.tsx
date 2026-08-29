import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { LogoFlight } from './LogoFlight';
import { cx } from './ui';

/** Perch 3D de la mascotte. Jamais de PNG. */
export function BrandMark({
  className,
  alt = 'Prospy',
  to = '/',
}: {
  className?: string;
  alt?: string;
  to?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  return (
    <>
      <LogoFlight sourceRef={ref} />
      <Link ref={ref} to={to} aria-label={alt} className={cx('app-logo-slot is-3d-wait', className)} />
    </>
  );
}
