import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Locale = 'fr' | 'en';

const KEY = 'prospy.lang';

const copy = {
  fr: {
    title: 'Prospy — Trouvez les commerces sans site web',
    nav: {
      product: 'Produit',
      features: 'Fonctionnalités',
      trust: 'Confiance',
      pricing: 'Tarifs',
      login: 'Connexion',
      start: 'Commencer',
      lang: 'Langue',
      menu: 'Menu',
      close: 'Fermer',
    },
    hero: {
      chip: 'prospection locale',
      h1a: 'Trouvez les commerces',
      h1b: 'sans site web.',
      lead: 'Prospy parcourt Google Maps métier par métier, écarte les entreprises déjà en ligne, et range le reste dans un pipeline d’appels — jusqu’à la signature.',
      cta: 'Commencer',
      see: 'Voir l’outil',
      leadShort: 'Un relevé Google Maps, uniquement les commerces sans site. Ensuite vous appelez, depuis le pipeline.',
    },
    steps: [
      {
        k: '01',
        t: 'Le problème',
        d: 'Les meilleurs prospects locaux n’ont souvent pas de site. Les trouver à la main dans Maps prend des heures.',
      },
      {
        k: '02',
        t: 'La méthode',
        d: 'Ville + métiers. Prospy ouvre chaque fiche, classe le web, récupère téléphone et adresse.',
      },
      {
        k: '03',
        t: 'Le bénéfice',
        d: 'Une liste d’appels, un score, une carte, un export. Vous passez du balayage à la conversation.',
      },
    ],
    product: {
      chip: 'produit',
      h2: 'Un poste de relevé, pas un CRM fourre-tout.',
      lead: 'Chercher, trier, appeler, classer. Exactement ce que fait le logiciel une fois connecté.',
    },
    preview: {
      chip: 'aperçu',
      h2: 'Ce que vous ouvrez après un relevé.',
      lead: 'Une liste d’appels, pas un tableur. Les maquettes plus bas montrent le logiciel, pas un décor.',
    },
    features: {
      chip: 'fonctionnalités',
      h2: 'Tout ce qu’il faut pour signer.',
      items: [
        {
          title: 'Relevé Google Maps',
          text: 'Ville et métiers. Prospy ne retient que les commerces sans vrai site web.',
          why: 'Fini de cliquer une par une dans Maps.',
        },
        {
          title: 'Pipeline',
          text: 'À trier, favoris, signés, non conclus. Une fiche traitée ne revient plus.',
          why: 'Le suivi tient dans un geste.',
        },
        {
          title: 'Session d’appels',
          text: 'Une entreprise à l’écran, notes, raccourcis pour signer ou écarter.',
          why: 'Vous restez au téléphone, pas dans la liste.',
        },
        {
          title: 'Carte et export',
          text: 'Positions GPS, Excel, CSV français, copie vers Google Sheets.',
          why: 'Le relevé sort de l’outil dès que vous en avez besoin.',
        },
      ],
      why: 'Pourquoi c’est utile —',
    },
    launch: {
      chip: 'lancer un relevé',
      h2: 'Une ville. Des métiers. Une liste d’appels.',
      lead: 'C’est tout ce que vous saisissez. Prospy se charge du parcours Maps, du filtre « sans site », et du classement.',
      run: 'Lancer',
    },
    trust: {
      chip: 'confiance',
      h2: 'Ce qui est réellement en place.',
      lead: 'Pas de certification inventée. Un audit professionnel reste nécessaire avant une production à grande échelle.',
      items: [
        {
          title: 'Secrets côté serveur',
          text: 'Les clés Stripe secrètes et le scraper ne sont jamais exposés au navigateur.',
        },
        {
          title: 'Comptes isolés',
          text: 'Modifier un identifiant dans l’URL ne donne pas accès aux fiches d’un autre compte.',
        },
        {
          title: 'Paiements Stripe',
          text: 'Les cartes sont saisies chez Stripe. Prospy ne stocke pas de données bancaires.',
        },
        {
          title: 'Sessions httpOnly',
          text: 'Cookie SameSite=Lax. Mots de passe dérivés avec scrypt.',
        },
      ],
    },
    pricing: {
      chip: 'tarifs',
      h2: 'Un abonnement, un outil.',
      lead: 'Les montants affichés viennent du serveur. Le montant facturé est toujours celui de Stripe.',
      month: 'par mois',
      stripeOff: 'Le paiement embarqué s’active lorsque les variables Stripe sont renseignées sur le serveur.',
    },
    cta: {
      h2: 'Passez du balayage Maps à la liste d’appels.',
      lead: 'Créez un compte, lancez un relevé, triez, appelez. Le même thème jour / nuit que dans l’outil.',
      create: 'Créer un compte',
      open: 'Ouvrir l’app',
    },
    mock: {
      newSearch: 'nouvelle recherche',
      runSurvey: 'Lancer le relevé',
      noSite: 'sans site · 47',
      favorites: 'favoris · à appeler',
      noSiteTag: 'sans site',
      signed: 'Signé',
      notClosed: 'Non conclu',
      score: 'feu de potentiel',
      export: 'export · csv / excel',
      mapHint: 'Lyon · 47 points',
      name: 'Nom',
      phone: 'Tél',
      scoreCol: 'Score',
    },
    footer: {
      blurb: 'Relevé de commerces locaux sans site web. Données par compte, paiements par Stripe.',
      product: 'produit',
      account: 'compte',
      look: 'apparence',
      copy: '© 2026 Prospy. Tous droits réservés.',
    },
    mascot: {
      home: 'Je te fais le tour de l’outil.',
      hero: 'Ceux-là n’ont pas de site. C’est eux qu’on appelle.',
      product: 'Une ville, des métiers : une liste d’appels.',
      features: 'Relevé, pipeline, appels, export. Rien d’autre.',
      trust: 'Tes fiches restent sur ton compte. Point.',
      pricing: 'Le montant affiché, c’est celui de Stripe.',
      click: [
        'On lance un relevé ?',
        'Je ne retiens que les sans-site.',
        'La liste d’appels est plus bas.',
        'Clique, je tourne. Ensuite tu cherches.',
      ],
    },
    guide: {
      skip: 'Passer',
      next: 'Suivant',
      done: 'C’est compris',
      steps: {
        logo: 'Je suis Prospy. Je te montre l’outil en trente secondes.',
        search: 'Ville et métiers. C’est tout ce qu’il faut pour un relevé.',
        launch: 'Tu lances. Je ne garde que les commerces sans site.',
        results: 'Les fiches arrivent ici. L’étoile, c’est à appeler.',
        pipeline: 'À trier, favoris, signés. Ton pipeline est là.',
      },
    },
    auth: {
      loginTitle: 'Connexion',
      registerTitle: 'Créer un compte',
      loginLead: 'E-mail et mot de passe suffisent. Google ouvre aussi l’export Sheets.',
      registerLead: 'Un compte isole vos fiches. Un code arrive par e-mail avant d’ouvrir l’outil.',
      email: 'e-mail',
      password: 'mot de passe',
      submitLogin: 'Se connecter',
      submitRegister: 'Créer le compte',
      wait: 'Un instant…',
      noAccount: 'Pas encore de compte ?',
      signup: 'S’inscrire',
      hasAccount: 'Déjà inscrit ?',
      signin: 'Se connecter',
      fail: 'La connexion a échoué.',
      google: 'Continuer avec Google',
      orEmail: 'ou par e-mail',
      forgot: 'Mot de passe oublié ?',
      forgotTitle: 'Mot de passe oublié',
      forgotLead: 'Indiquez votre e-mail. Un code permet de choisir un nouveau mot de passe.',
      forgotSubmit: 'Envoyer le code',
      forgotSent: 'Si un compte existe, le code est parti. Vérifiez votre boîte mail.',
      newPassword: 'nouveau mot de passe',
      resetSubmit: 'Enregistrer le mot de passe',
      codeTitle: 'Code reçu par e-mail',
      codeLead: 'Six chiffres, valables dix minutes.',
      code: 'code',
      codeSubmit: 'Valider le code',
      resend: 'Renvoyer le code',
      resent: 'Un nouveau code a été envoyé.',
      back: 'Retour',
    },
  },
  en: {
    title: 'Prospy — Find local businesses with no website',
    nav: {
      product: 'Product',
      features: 'Features',
      trust: 'Trust',
      pricing: 'Pricing',
      login: 'Log in',
      start: 'Get started',
      lang: 'Language',
      menu: 'Menu',
      close: 'Close',
    },
    hero: {
      chip: 'local prospecting',
      h1a: 'Find the businesses',
      h1b: 'with no website.',
      lead: 'Prospy walks Google Maps trade by trade, drops companies that already have a real site, and files the rest into a call pipeline — through to the signature.',
      cta: 'Get started',
      see: 'See the tool',
      leadShort: 'A Google Maps survey — only businesses with no website. Then you call, from the pipeline.',
    },
    steps: [
      {
        k: '01',
        t: 'The problem',
        d: 'The best local prospects often have no website. Hunting them by hand in Maps takes hours.',
      },
      {
        k: '02',
        t: 'The method',
        d: 'City + trades. Prospy opens each listing, classifies the web, and pulls phone and address.',
      },
      {
        k: '03',
        t: 'The payoff',
        d: 'A call list, a score, a map, an export. You go from scanning to the conversation.',
      },
    ],
    product: {
      chip: 'product',
      h2: 'A survey desk, not a catch-all CRM.',
      lead: 'Search, sort, call, file. Exactly what the software does once you are signed in.',
    },
    preview: {
      chip: 'preview',
      h2: 'What you open after a survey.',
      lead: 'A call list, not a spreadsheet. The windows below are the actual software, not decoration.',
    },
    features: {
      chip: 'features',
      h2: 'Everything you need to close.',
      items: [
        {
          title: 'Google Maps survey',
          text: 'City and trades. Prospy keeps only businesses with no real website.',
          why: 'No more clicking Maps one listing at a time.',
        },
        {
          title: 'Pipeline',
          text: 'To sort, starred, signed, not closed. A treated card does not come back.',
          why: 'Follow-up fits in one gesture.',
        },
        {
          title: 'Call session',
          text: 'One company on screen, notes, shortcuts to sign or drop.',
          why: 'You stay on the phone, not in the list.',
        },
        {
          title: 'Map and export',
          text: 'GPS pins, Excel, French CSV, copy to Google Sheets.',
          why: 'The survey leaves the tool as soon as you need it.',
        },
      ],
      why: 'Why it helps —',
    },
    launch: {
      chip: 'run a survey',
      h2: 'One city. A few trades. A call list.',
      lead: 'That is all you type. Prospy handles the Maps walk, the no-website filter, and the ranking.',
      run: 'Run',
    },
    trust: {
      chip: 'trust',
      h2: 'What is actually in place.',
      lead: 'No invented certification. A professional audit is still required before large-scale production.',
      items: [
        {
          title: 'Secrets stay on the server',
          text: 'Stripe secret keys and the scraper are never exposed to the browser.',
        },
        {
          title: 'Isolated accounts',
          text: 'Changing an id in the URL does not open another account’s cards.',
        },
        {
          title: 'Stripe payments',
          text: 'Cards are entered at Stripe. Prospy does not store bank data.',
        },
        {
          title: 'httpOnly sessions',
          text: 'SameSite=Lax cookie. Passwords derived with scrypt.',
        },
      ],
    },
    pricing: {
      chip: 'pricing',
      h2: 'One subscription, one tool.',
      lead: 'Amounts come from the server. The billed amount is always Stripe’s.',
      month: 'per month',
      stripeOff: 'Embedded checkout turns on when Stripe variables are set on the server.',
    },
    cta: {
      h2: 'Go from scanning Maps to a call list.',
      lead: 'Create an account, run a survey, sort, call. The same day / night theme as in the tool.',
      create: 'Create an account',
      open: 'Open the app',
    },
    mock: {
      newSearch: 'new search',
      runSurvey: 'Run the survey',
      noSite: 'no website · 47',
      favorites: 'starred · to call',
      noSiteTag: 'no website',
      signed: 'Signed',
      notClosed: 'Not closed',
      score: 'potential score',
      export: 'export · csv / excel',
      mapHint: 'Lyon · 47 pins',
      name: 'Name',
      phone: 'Phone',
      scoreCol: 'Score',
    },
    footer: {
      blurb: 'Survey of local businesses with no website. Data per account, payments via Stripe.',
      product: 'product',
      account: 'account',
      look: 'appearance',
      copy: '© 2026 Prospy. All rights reserved.',
    },
    mascot: {
      home: 'I’ll walk you through the tool.',
      hero: 'These have no website. They’re the ones you call.',
      product: 'A city, some trades: a call list.',
      features: 'Survey, pipeline, calls, export. That’s it.',
      trust: 'Your cards stay on your account. Full stop.',
      pricing: 'The price on screen is the Stripe price.',
      click: [
        'Run a survey?',
        'I only keep shops with no site.',
        'The call list is further down.',
        'Click and I spin. Then you search.',
      ],
    },
    guide: {
      skip: 'Skip',
      next: 'Next',
      done: 'Got it',
      steps: {
        logo: 'I’m Prospy. I’ll show you the tool in thirty seconds.',
        search: 'City and trades. That’s all a survey needs.',
        launch: 'You start it. I only keep shops with no website.',
        results: 'Cards land here. Star them to call later.',
        pipeline: 'Inbox, favorites, signed. Your pipeline is here.',
      },
    },
    auth: {
      loginTitle: 'Log in',
      registerTitle: 'Create an account',
      loginLead: 'Email and password are enough. Google also unlocks Sheets export.',
      registerLead: 'An account isolates your cards. A code arrives by email before the tool opens.',
      email: 'email',
      password: 'password',
      submitLogin: 'Log in',
      submitRegister: 'Create account',
      wait: 'One moment…',
      noAccount: 'No account yet?',
      signup: 'Sign up',
      hasAccount: 'Already registered?',
      signin: 'Log in',
      fail: 'Sign-in failed.',
      google: 'Continue with Google',
      orEmail: 'or by email',
      forgot: 'Forgot password?',
      forgotTitle: 'Forgot password',
      forgotLead: 'Enter your email. A code lets you choose a new password.',
      forgotSubmit: 'Send the code',
      forgotSent: 'If an account exists, the code is on its way. Check your inbox.',
      newPassword: 'new password',
      resetSubmit: 'Save password',
      codeTitle: 'Code from your email',
      codeLead: 'Six digits, valid for ten minutes.',
      code: 'code',
      codeSubmit: 'Confirm code',
      resend: 'Send a new code',
      resent: 'A new code was sent.',
      back: 'Back',
    },
  },
} as const;

type Copy = (typeof copy)[Locale];

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (next: Locale) => void;
  m: Copy;
} | null>(null);

function readLocale(): Locale {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'en' || stored === 'fr') return stored;
  } catch {
    /* ignore */
  }
  return navigator.language.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => (typeof document === 'undefined' ? 'fr' : readLocale()));

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(KEY, next);
    document.documentElement.lang = next;
  };

  return <LocaleContext.Provider value={{ locale, setLocale, m: copy[locale] }}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useI18n must be used inside LocaleProvider');
  return ctx;
}
