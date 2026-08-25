/** Charge `.env` local si présent (Node 22+). Les secrets restent hors git. */
try {
  process.loadEnvFile();
} catch {
  /* pas de fichier .env : variables déjà dans l’environnement */
}
