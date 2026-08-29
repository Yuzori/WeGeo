import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from '../components/BrandMark';
import { useI18n } from '../i18n';

export function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const { locale } = useI18n();
  const fr = locale !== 'en';
  const title = kind === 'privacy' ? (fr ? 'Confidentialité' : 'Privacy policy') : fr ? 'Conditions d’utilisation' : 'Terms of use';

  useEffect(() => {
    document.title = `${title}. Prospy`;
  }, [title]);

  return (
    <div className="landing">
      <div className="mx-auto max-w-2xl px-3 py-10 sm:px-4 sm:py-12">
        <BrandMark alt="Prospy" className="mb-8 h-10 w-10" />
        <p className="legend mb-2">{fr ? 'documents' : 'legal'}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">{fr ? 'Dernière mise à jour. 26 août 2026.' : 'Last updated. 26 August 2026.'}</p>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted">
          {kind === 'privacy' ? (fr ? <PrivacyFr /> : <PrivacyEn />) : fr ? <TermsFr /> : <TermsEn />}
        </div>
        <p className="mt-10 text-sm">
          <Link to={kind === 'privacy' ? '/cgu' : '/confidentialite'} className="font-medium text-lime-deep">
            {kind === 'privacy' ? (fr ? 'Conditions d’utilisation' : 'Terms of use') : fr ? 'Politique de confidentialité' : 'Privacy policy'}
          </Link>
          {' · '}
          <Link to="/" className="font-medium text-lime-deep">
            {fr ? 'Retour' : 'Back'}
          </Link>
        </p>
      </div>
    </div>
  );
}

function PrivacyFr() {
  return (
    <>
      <p>
        Prospy (prospy.fr) est un outil de prospection locale. Cette politique décrit les données personnelles que nous
        traitons lorsque vous créez un compte, vous connectez (y compris avec Google) ou utilisez l’application.
      </p>
      <h2 className="text-base font-semibold text-ink">Données collectées</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Compte. E-mail, pseudo, mot de passe (stocké sous forme de hash), date de création.</li>
        <li>Google. Identifiant Google, e-mail, jetons d’accès nécessaires à la connexion et à l’export Sheets, si vous le demandez.</li>
        <li>Usage. Sessions de connexion, espaces de travail, invitations, recherches et fiches d’entreprises que vous générez (dont le nom du dirigeant, issu de l’API publique Recherche d’entreprises / SIRENE).</li>
        <li>Paiement. Identifiants Stripe (pas de numéro de carte stocké chez Prospy), si un abonnement est souscrit.</li>
        <li>Technique. Journaux serveur limités (erreurs, sécurité).</li>
      </ul>
      <h2 className="text-base font-semibold text-ink">Finalités</h2>
      <p>
        Fournir le service (compte, sessions partagées, relevés, export), sécuriser l’accès, envoyer les e-mails
        transactionnels (code, invitation, mot de passe) et, le cas échéant, gérer l’abonnement. Base légale. Exécution
        du contrat et intérêt légitime de sécurité. Pas de publicité tierce, pas de vente de données.
      </p>
      <h2 className="text-base font-semibold text-ink">Connexion Google</h2>
      <p>
        Si vous choisissez « Continuer avec Google », Prospy demande l’e-mail et le profil (pour créer ou retrouver le
        compte), et l’autorisation Google Sheets (pour créer un tableur de vos relevés uniquement quand vous cliquez sur
        exporter). Ces accès ne servent à rien d’autre. Pas de lecture de Drive, pas d’envoi d’e-mails, pas de
        publicité, pas de revente. Vous pouvez révoquer l’accès dans votre compte Google à tout moment.
      </p>
      <h2 className="text-base font-semibold text-ink">Conservation et destinataires</h2>
      <p>
        Les données restent le temps du compte, puis sont supprimées ou anonymisées après clôture. Hébergement et e-mail.
        Prestataires techniques (hébergeur, Resend, Stripe, Google). Pas de transfert hors de ces finalités.
      </p>
      <h2 className="text-base font-semibold text-ink">Vos droits</h2>
      <p>
        Accès, rectification, suppression, opposition, portabilité. Écrivez à contact@prospy.fr. Réclamation possible
        auprès de la CNIL. Les fiches de prospects que vous collectez via Maps sont sous votre responsabilité (RGPD
        applicable à votre fichier client).
      </p>
    </>
  );
}

function PrivacyEn() {
  return (
    <>
      <p>
        Prospy (prospy.fr) is a local prospecting tool. This policy explains the personal data we process when you create
        an account, sign in (including with Google), or use the app.
      </p>
      <h2 className="text-base font-semibold text-ink">Data we collect</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Account. Email, username, password (stored as a hash), creation date.</li>
        <li>Google. Google id, email, and tokens needed for sign-in and Sheets export, if you request it.</li>
        <li>Usage. Login sessions, workspaces, invites, searches and business cards you generate (including the legal representative’s name from the public SIRENE / Recherche d’entreprises API).</li>
        <li>Billing. Stripe identifiers (no card numbers stored by Prospy), if you subscribe.</li>
        <li>Technical. Limited server logs (errors, security).</li>
      </ul>
      <h2 className="text-base font-semibold text-ink">Purposes</h2>
      <p>
        To provide the service, secure access, send transactional email (codes, invites, password reset), and manage a
        subscription when applicable. Legal bases. Contract and legitimate interest in security. No third-party ads, no
        sale of data.
      </p>
      <h2 className="text-base font-semibold text-ink">Google sign-in</h2>
      <p>
        If you choose Continue with Google, Prospy asks for email and profile (to create or find your account), and for
        Google Sheets access (to create a spreadsheet of your surveys only when you click export). Nothing else. No Drive
        browsing, no sending email as you, no ads, no resale. You can revoke access in your Google account at any time.
      </p>
      <h2 className="text-base font-semibold text-ink">Retention and recipients</h2>
      <p>
        Data is kept while the account exists, then deleted or anonymised. Hosting and email go through technical
        providers (host, Resend, Stripe, Google).
      </p>
      <h2 className="text-base font-semibold text-ink">Your rights</h2>
      <p>
        Access, correction, deletion, objection, portability. Write to contact@prospy.fr. You may also complain to a supervisory
        authority. Prospect records you collect from Maps are your responsibility under applicable privacy law.
      </p>
    </>
  );
}

function TermsFr() {
  return (
    <>
      <p>
        Les présentes conditions régissent l’accès à Prospy, outil de relevé de commerces locaux (Google Maps) et de
        suivi d’un pipeline d’appels. En créant un compte, vous les acceptez.
      </p>
      <h2 className="text-base font-semibold text-ink">Compte</h2>
      <p>
        Vous devez fournir un e-mail et un pseudo exacts, et garder vos identifiants confidentiels. Un compte Google
        peut servir à la connexion et à l’export Sheets. Vous êtes responsable de l’activité réalisée depuis votre
        compte et des sessions que vous partagez.
      </p>
      <h2 className="text-base font-semibold text-ink">Usage autorisé</h2>
      <p>
        Prospy est destiné à une prospection professionnelle. Vous vous engagez à respecter le droit applicable (dont
        RGPD, démarchage, conditions de Google). Interdit. Usage abusif, scraping hors de l’outil, atteinte à la
        sécurité, revente brute du service.
      </p>
      <h2 className="text-base font-semibold text-ink">Service et abonnement</h2>
      <p>
        Le service est fourni « en l’état ». Certaines fonctions (relevés, volume) peuvent nécessiter un abonnement
        Stripe. Les montants affichés sont ceux facturés par Stripe. Nous pouvons faire évoluer l’outil avec un préavis
        raisonnable.
      </p>
      <h2 className="text-base font-semibold text-ink">Données et responsabilité</h2>
      <p>
        Les fiches proviennent de sources publiques via Google Maps ; elles peuvent être incomplètes. Prospy n’est pas
        responsable de l’usage que vous faites des contacts. Notre responsabilité, si elle était retenue, est limitée
        aux sommes payées sur les 12 derniers mois. Droit français, tribunaux compétents du siège de l’éditeur.
      </p>
      <p>Contact. contact@prospy.fr</p>
    </>
  );
}

function TermsEn() {
  return (
    <>
      <p>
        These terms govern access to Prospy, a local-business survey tool (Google Maps) with a call pipeline. Creating
        an account means you accept them.
      </p>
      <h2 className="text-base font-semibold text-ink">Account</h2>
      <p>
        You must provide a valid email and username and keep credentials confidential. A Google account may be used to
        sign in and export to Sheets. You are responsible for activity on your account and shared sessions.
      </p>
      <h2 className="text-base font-semibold text-ink">Acceptable use</h2>
      <p>
        Prospy is for professional prospecting. You must follow applicable law (privacy, outreach, Google terms). Abuse,
        scraping outside the product, security attacks, or reselling the service are forbidden.
      </p>
      <h2 className="text-base font-semibold text-ink">Service and billing</h2>
      <p>
        The service is provided as-is. Some features may require a Stripe subscription. Displayed prices are what Stripe
        charges. We may change the product with reasonable notice.
      </p>
      <h2 className="text-base font-semibold text-ink">Data and liability</h2>
      <p>
        Cards come from public Google Maps data and may be incomplete. You are responsible for how you use contacts. If
        liability is found, it is limited to amounts paid in the last 12 months. French law applies.
      </p>
      <p>Contact. contact@prospy.fr</p>
    </>
  );
}
