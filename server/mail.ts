/**
 * Envoi des codes de vérification. Resend si une clé est présente, sinon SMTP,
 * sinon (hors production) le code est affiché dans le terminal pour tester.
 */

import nodemailer from 'nodemailer';

export type MailPurpose = 'verify' | 'login' | 'reset';

const SUBJECT: Record<MailPurpose, { fr: string; en: string }> = {
  verify: { fr: 'Votre code Prospy', en: 'Your Prospy code' },
  login: { fr: 'Code de connexion Prospy', en: 'Prospy sign-in code' },
  reset: { fr: 'Réinitialisation du mot de passe Prospy', en: 'Reset your Prospy password' },
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
};

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() || process.env.SMTP_HOST?.trim());
}

export function mailFrom(): string {
  return process.env.MAIL_FROM?.trim() || 'Prospy <noreply@localhost>';
}

export async function sendCodeEmail(params: {
  to: string;
  code: string;
  purpose: MailPurpose;
  locale?: string;
}): Promise<void> {
  const lang = params.locale === 'en' ? 'en' : 'fr';
  const subject = SUBJECT[params.purpose][lang];
  const intro = INTRO[params.purpose][lang];
  const minutes = lang === 'en' ? 'This code expires in 10 minutes. If you did not request it, ignore this email.' : 'Ce code expire dans 10 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.';
  const text = `${intro}\n\n${params.code}\n\n${minutes}`;
  const html = `<div style="font-family:Syne,system-ui,sans-serif;background:#10140e;color:#f3f0e6;padding:32px">
  <p style="color:#b7e133;letter-spacing:.14em;font-size:11px;text-transform:uppercase">Prospy</p>
  <p style="font-size:16px;line-height:1.5">${intro}</p>
  <p style="font-size:32px;letter-spacing:.28em;font-weight:800;color:#b7e133">${params.code}</p>
  <p style="font-size:13px;color:#b8c0a8">${minutes}</p>
</div>`;

  if (process.env.RESEND_API_KEY?.trim()) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: mailFrom(), to: [params.to], subject, html, text }),
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
    await transporter.sendMail({ from: mailFrom(), to: params.to, subject, text, html });
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Aucun service e-mail n’est configuré (RESEND_API_KEY ou SMTP_HOST).');
  }

  console.log(`[Prospy mail] ${params.purpose} → ${params.to}  code ${params.code}`);
}
