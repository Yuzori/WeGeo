/** Chemins d’une session de travail (`/app/s/:id/...`). */
export function sessionPath(id: number | string, rest = ''): string {
  const suffix = !rest ? '' : rest.startsWith('/') ? rest : `/${rest}`;
  return `/app/s/${id}${suffix}`;
}
