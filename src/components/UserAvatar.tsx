import { cx } from './ui';

export function UserAvatar({
  username,
  avatarUrl,
  size = 32,
  className,
}: {
  username: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const initial = (username.trim()[0] || '?').toUpperCase();
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        className={cx('shrink-0 rounded-full object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full border border-lime-line bg-lime-soft font-semibold text-lime-deep',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.42) }}
    >
      {initial}
    </span>
  );
}
