/**
 * Envoi des codes de vérification. Resend si une clé est présente, sinon SMTP,
 * sinon (hors production) le code est affiché dans le terminal pour tester.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';

export type MailPurpose = 'verify' | 'login' | 'reset' | 'invite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOGO_CID = 'prospy-mark';

const SUBJECT: Record<MailPurpose, { fr: string; en: string }> = {
  verify: { fr: 'Votre code Prospy', en: 'Your Prospy code' },
  login: { fr: 'Code de connexion Prospy', en: 'Prospy sign-in code' },
  reset: { fr: 'Réinitialisation du mot de passe Prospy', en: 'Reset your Prospy password' },
  invite: { fr: 'Invitation à une session Prospy', en: 'Prospy session invitation' },
};

const INTRO: Record<MailPurpose, { fr: string; en: string }> = {
  verify: {
    fr: 'Voici le code pour confirmer votre adresse e-mail.',
    en: 'Use this code to confirm your email address.',
  },
  login: {
    fr: 'Voici le code pour ouvrir votre session Prospy.',
    en: 'Use this code to open your Prospy session.',
  },
  reset: {
    fr: 'Voici le code pour choisir un nouveau mot de passe.',
    en: 'Use this code to choose a new password.',
  },
  invite: {
    fr: 'On vous attend dans une session Prospy.',
    en: 'You have been invited to a Prospy session.',
  },
};

const COPY = {
  fr: {
    brand: 'Prospy',
    kickerCode: 'Code de sécurité',
    kickerInvite: 'Invitation',
    title: {
      verify: 'Confirmez votre e-mail',
      login: 'Connexion à Prospy',
      reset: 'Nouveau mot de passe',
    } as Record<Exclude<MailPurpose, 'invite'>, string>,
    expires: 'Ce code expire dans 10 minutes.',
    ignore: 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.',
    inviteHint: 'Connectez-vous à l’application pour accepter ou refuser l’invitation.',
    cta: 'Ouvrir Prospy',
    footer: 'E-mail transactionnel envoyé par Prospy. Pas besoin de répondre.',
  },
  en: {
    brand: 'Prospy',
    kickerCode: 'Security code',
    kickerInvite: 'Invitation',
    title: {
      verify: 'Confirm your email',
      login: 'Sign in to Prospy',
      reset: 'Reset your password',
    } as Record<Exclude<MailPurpose, 'invite'>, string>,
    expires: 'This code expires in 10 minutes.',
    ignore: 'If you did not request this, you can ignore this email.',
    inviteHint: 'Sign in to the app to accept or decline the invitation.',
    cta: 'Open Prospy',
    footer: 'Transactional email from Prospy. No need to reply.',
  },
};

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() || process.env.SMTP_HOST?.trim());
}

export function mailFrom(): string {
  return process.env.MAIL_FROM?.trim() || 'Prospy <noreply@localhost>';
}

function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:5173').replace(/\/$/, '');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

let logoCache: string | null | undefined;

function logoBase64(): string | null {
  if (logoCache !== undefined) return logoCache;
  try {
    try {
      logoCache = readFileSync(join(ROOT, 'public', 'apple-touch-icon.png')).toString('base64');
    } catch {
      logoCache = readFileSync(join(ROOT, 'public', 'email-mark.png')).toString('base64');
    }
  } catch {
    logoCache = null;
  }
  return logoCache;
}

function logoImg(): string {
  if (!logoBase64()) {
    return `<span style="display:inline-block;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;letter-spacing:.02em;color:#c6f042">Prospy</span>`;
  }
  return `<img src="cid:${LOGO_CID}" alt="Prospy" width="40" style="display:block;width:40px;height:auto;border:0;outline:none;text-decoration:none" />`;
}

function layout(params: { preheader: string; kicker: string; title: string; inner: string; footer: string }): string {
  const { preheader, kicker, title, inner, footer } = params;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#eae5d6;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eae5d6;margin:0;padding:0">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;border-collapse:separate">
          <tr>
            <td style="background:#10140e;padding:22px 28px;border-radius:18px 18px 0 0">
              ${logoImg()}
            </td>
          </tr>
          <tr>
            <td style="background:#fffdf6;padding:36px 32px 28px;font-family:Georgia,'Iowan Old Style','Palatino Linotype',serif;color:#13170f">
              <p style="margin:0 0 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#4d7c0f;font-weight:700">${escapeHtml(kicker)}</p>
              <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:#13170f">${escapeHtml(title)}</h1>
              ${inner}
            </td>
          </tr>
          <tr>
            <td style="background:#f3f0e6;padding:18px 32px 22px;border-radius:0 0 18px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;line-height:1.5;color:#8b937c">
              ${escapeHtml(footer)}<br />
              <a href="${escapeHtml(appUrl())}" style="color:#4d7c0f;text-decoration:none">prospy.fr</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function deliver(to: string, subject: string, text: string, html: string, log: string): Promise<void> {
  const logo = logoBase64();
  const resendAttachment = logo
    ? [{ filename: 'prospy.png', content: logo, content_type: 'image/png', content_id: LOGO_CID }]
    : undefined;

  if (process.env.RESEND_API_KEY?.trim()) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: mailFrom(),
        to: [to],
        subject,
        html,
        text,
        ...(resendAttachment ? { attachments: resendAttachment } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend a refusé l’envoi (${res.status}) ${body.slice(0, 180)}`);
    }
    return;
  }

  if (process.env.SMTP_HOST?.trim()) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
        : undefined,
    });
    await transporter.sendMail({
      from: mailFrom(),
      to,
      subject,
      text,
      html,
      attachments: logo
        ? [{ filename: 'prospy.png', content: Buffer.from(logo, 'base64'), cid: LOGO_CID, contentType: 'image/png' }]
        : undefined,
    });
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Aucun service e-mail n’est configuré (RESEND_API_KEY ou SMTP_HOST).');
  }

  console.log(`[Prospy mail] ${log}`);
}

export async function sendCodeEmail(params: {
  to: string;
  code: string;
  purpose: Exclude<MailPurpose, 'invite'>;
  locale?: string;
}): Promise<void> {
  const lang = params.locale === 'en' ? 'en' : 'fr';
  const copy = COPY[lang];
  const subject = SUBJECT[params.purpose][lang];
  const intro = INTRO[params.purpose][lang];
  const title = copy.title[params.purpose];
  const code = escapeHtml(params.code);
  const inner = `
    <p style="margin:0 0 24px;font-size:16px;line-height:1.55;color:#59604c">${escapeHtml(intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">
      <tr>
        <td align="center" style="background:#10140e;border-radius:14px;padding:26px 16px">
          <p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#96a189">Prospy</p>
          <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:36px;line-height:1;letter-spacing:.34em;font-weight:800;color:#c6f042;padding-left:.34em">${code}</p>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.55;color:#8b937c">${escapeHtml(copy.expires)} ${escapeHtml(copy.ignore)}</p>
  `;
  const html = layout({
    preheader: `${params.code} · ${copy.expires}`,
    kicker: copy.kickerCode,
    title,
    inner,
    footer: copy.footer,
  });
  const text = `${intro}\n\n${params.code}\n\n${copy.expires} ${copy.ignore}`;
  await deliver(params.to, subject, text, html, `${params.purpose} → ${params.to}  code ${params.code}`);
}

export async function sendInviteEmail(params: {
  to: string;
  fromEmail: string;
  workspaceName: string;
  locale?: string;
}): Promise<void> {
  const lang = params.locale === 'en' ? 'en' : 'fr';
  const copy = COPY[lang];
  const subject = SUBJECT.invite[lang];
  const intro =
    lang === 'en'
      ? `${params.fromEmail} invited you to “${params.workspaceName}” on Prospy.`
      : `${params.fromEmail} vous invite dans « ${params.workspaceName} » sur Prospy.`;
  const href = `${appUrl()}/app`;
  const inner = `
    <p style="margin:0 0 20px;font-size:16px;line-height:1.55;color:#59604c">${escapeHtml(intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px">
      <tr>
        <td style="background:#f3f0e6;border:1px solid #dcd5c1;border-radius:12px;padding:16px 18px">
          <p style="margin:0 0 4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#8b937c">${lang === 'en' ? 'Session' : 'Session'}</p>
          <p style="margin:0;font-size:20px;line-height:1.3;font-weight:700;color:#13170f">${escapeHtml(params.workspaceName)}</p>
        </td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px">
      <tr>
        <td style="background:#c6f042;border-radius:999px">
          <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;font-weight:700;color:#13170f;text-decoration:none">${escapeHtml(copy.cta)}</a>
        </td>
      </tr>
    </table>
    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;line-height:1.55;color:#8b937c">${escapeHtml(copy.inviteHint)}</p>
  `;
  const html = layout({
    preheader: intro,
    kicker: copy.kickerInvite,
    title: lang === 'en' ? 'Join this session' : 'Rejoindre cette session',
    inner,
    footer: copy.footer,
  });
  const text = `${intro}\n\n${copy.inviteHint}\n${href}`;
  await deliver(params.to, subject, text, html, `invite → ${params.to}  ${params.workspaceName}`);
}
