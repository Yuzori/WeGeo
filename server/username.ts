const USERNAME_RE = /^[a-z][a-z0-9._-]{2,23}$/;
const RESERVED = new Set([
  'admin',
  'prospy',
  'support',
  'contact',
  'root',
  'api',
  'me',
  'null',
  'undefined',
  'system',
  'help',
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  const username = normalizeUsername(raw);
  if (username.length < 3) return 'Le pseudo doit contenir au moins 3 caractères.';
  if (username.length > 24) return 'Le pseudo est trop long (24 caractères max).';
  if (!USERNAME_RE.test(username)) {
    return 'Le pseudo commence par une lettre, puis lettres, chiffres, point, tiret ou underscore.';
  }
  if (RESERVED.has(username)) return 'Ce pseudo n’est pas disponible.';
  return null;
}

export function usernameSeedFromEmail(email: string): string {
  const local = email.split('@')[0]?.toLowerCase().replace(/[^a-z0-9._-]/g, '') ?? '';
  let base = local.replace(/^[^a-z]+/, '') || 'user';
  if (base.length < 3) base = `${base}user`;
  return base.slice(0, 24);
}

/** Premier mot utilisable d’un nom Google (« Achraf El Ammar » → achraf). */
export function usernameFromDisplayName(name: string): string {
  const folded = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const parts = folded.split(/[^a-z0-9]+/).filter((part) => part.length >= 3 && /^[a-z]/.test(part));
  if (parts[0]) return parts[0].slice(0, 24);
  return usernameSeedFromEmail(`${folded.replace(/[^a-z0-9]/g, '') || 'user'}@prospy.local`);
}
