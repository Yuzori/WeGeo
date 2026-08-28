/**
 * Connexion Google et export Sheets. Les jetons restent côté serveur.
 */

import { OAuth2Client } from 'google-auth-library';
import type { Request } from 'express';
import { publicBaseUrl } from './security.ts';
import { toRows } from './export.ts';
import type { Lead } from '../shared/types.ts';

const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/spreadsheets',
];

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function googleRedirectUri(req: Request): string {
  return `${publicBaseUrl(req)}/api/auth/google/callback`;
}

export function googleClient(req: Request): OAuth2Client {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error('Google OAuth n’est pas configuré.');
  return new OAuth2Client(id, secret, googleRedirectUri(req));
}

export function googleAuthUrl(req: Request, state: string): string {
  return googleClient(req).generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: SCOPES,
    state,
  });
}

export async function exchangeGoogleCode(req: Request, code: string) {
  const client = googleClient(req);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token ?? '',
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  const email = payload?.email?.trim().toLowerCase();
  const googleId = payload?.sub;
  if (!email || !googleId || !payload?.email_verified) {
    throw new Error('Le compte Google n’a pas d’e-mail vérifié.');
  }
  return {
    email,
    googleId,
    name: payload.given_name?.trim() || payload.name?.trim() || '',
    picture: payload.picture?.trim() || null,
    refreshToken: tokens.refresh_token ?? null,
    accessToken: tokens.access_token ?? null,
    expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
  };
}

export async function googleAccessToken(refreshToken: string, req: Request): Promise<string> {
  const client = googleClient(req);
  client.setCredentials({ refresh_token: refreshToken });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Impossible de renouveler le jeton Google.');
  return token;
}

export async function createGoogleSheet(params: {
  accessToken: string;
  title: string;
  leads: Lead[];
}): Promise<{ url: string; id: string }> {
  const created = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title: params.title.slice(0, 80) },
      sheets: [{ properties: { title: 'Prospects' } }],
    }),
  });
  if (!created.ok) {
    const body = await created.text().catch(() => '');
    throw new Error(`Google Sheets a refusé la création (${created.status}) ${body.slice(0, 180)}`);
  }
  const sheet = (await created.json()) as { spreadsheetId: string; spreadsheetUrl?: string };
  const { headers, rows } = toRows(params.leads);
  const written = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheet.spreadsheetId}/values/Prospects!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [headers, ...rows] }),
    },
  );
  if (!written.ok) {
    const body = await written.text().catch(() => '');
    throw new Error(`Google Sheets a refusé l’écriture (${written.status}) ${body.slice(0, 180)}`);
  }
  return {
    id: sheet.spreadsheetId,
    url: sheet.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${sheet.spreadsheetId}`,
  };
}
