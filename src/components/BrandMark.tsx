import { cx } from './ui';

/** Icône carrée Prospy (`public/apple-touch-icon.png`). */
export function BrandMark({
  className,
  alt = 'Prospy',
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src="/apple-touch-icon.png"
      alt={alt}
      width={180}
      height={180}
      decoding="async"
      className={cx('object-contain', className)}
    />
  );
}
