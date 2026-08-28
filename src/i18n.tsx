import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { morphLangBoxes, snapshotLangBoxes } from './lib/langMorph';

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
      app: 'Ouvrir l’app',
      account: 'Compte',
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
        d: 'Ville + métiers. Prospy ouvre chaque fiche, classe le web, récupère téléphone, adresse et dirigeant.',
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
      googleTitle: 'Pourquoi Prospy demande un compte Google',
      googleText:
        'La connexion Google sert à ouvrir votre compte Prospy (e-mail et nom). L’accès à Google Sheets sert uniquement à créer un tableur de vos relevés quand vous cliquez sur exporter. Prospy ne lit pas vos autres fichiers, n’envoie pas d’e-mails en votre nom, et n’utilise pas ces données pour de la publicité.',
      googlePrivacy: 'Politique de confidentialité',
    },
    pricing: {
      chip: 'tarifs',
      h2: 'Un abonnement, un outil.',
      lead: 'Chaque offre enlève ou débloque des plafonds (relevés, réglages, équipe, nom du dirigeant). Les prix ci-dessous sont ceux prévus. Stripe n’est pas encore branché : rien n’est limité dans l’outil pour le moment.',
      month: 'par mois',
      stripeOff: 'Le paiement Stripe viendra ensuite. Les croix décrivent l’offre, elles ne sont pas encore appliquées.',
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
      mapHint: '{city} · 47 points',
      name: 'Nom',
      phone: 'Tél',
      scoreCol: 'Score',
      owner: 'Dirigeant',
      ownerMissing: 'Dirigeant non trouvé',
      source: 'Source',
    },
    footer: {
      blurb: 'Relevé de commerces locaux sans site web. Données par compte, paiements par Stripe.',
      product: 'produit',
      account: 'compte',
      look: 'apparence',
      legal: 'légal',
      terms: 'conditions',
      privacy: 'confidentialité',
      copy: '© 2026 Prospy. Tous droits réservés.',
    },
    mascot: {
      home: 'Je te fais le tour de l’outil.',
      hero: 'Ceux-là n’ont pas de site. C’est eux qu’on appelle.',
      product: 'Une ville, des métiers : une liste d’appels.',
      features: 'Relevé, pipeline, appels, export. Rien d’autre.',
      trust: 'Tes fiches restent sur ton compte. Point.',
      pricing: 'Starter bride le relevé. Pro débloque le dirigeant. Agence, plus de plafond.',
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
        invite: 'Ici tu invites un associé : pseudo ou e-mail, puis la flèche.',
      },
    },
    auth: {
      loginTitle: 'Connexion',
      registerTitle: 'Créer un compte',
      loginLead: 'Pseudo ou e-mail, plus le mot de passe. Google ouvre aussi l’export Sheets.',
      registerLead: 'E-mail, pseudo et mot de passe. Un code arrive par e-mail avant d’ouvrir l’outil.',
      email: 'e-mail',
      username: 'pseudo',
      photo: 'photo de profil (optionnel)',
      photoHint: 'Sinon on affichera l’initiale de votre pseudo.',
      photoChoose: 'Choisir une photo',
      photoRemove: 'Retirer',
      identifier: 'pseudo ou e-mail',
      password: 'mot de passe',
      showPassword: 'Afficher le mot de passe',
      hidePassword: 'Masquer le mot de passe',
      strengthWeak: 'faible',
      strengthFair: 'moyen',
      strengthGood: 'solide',
      strengthStrong: 'fort',
      termsPrefix: 'En continuant, vous acceptez les',
      terms: 'conditions d’utilisation',
      termsAnd: 'et la',
      privacy: 'politique de confidentialité',
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
    settings: {
      docTitle: 'Compte — Prospy',
      kicker: 'votre compte',
      title: 'Réglages',
      lead: 'Photo, pseudo, langue, apparence. Ce qui vous identifie dans les sessions partagées.',
      back: 'Retour',
      backHome: 'Retour à l’accueil',
      backSessions: 'Retour aux sessions',
      backSession: 'Retour au projet',
      identity: 'Identité',
      changePhoto: 'Changer la photo',
      useInitial: 'Utiliser l’initiale',
      username: 'pseudo',
      email: 'e-mail',
      currentPassword: 'mot de passe actuel',
      newPassword: 'nouveau mot de passe',
      addPassword: 'ajouter un mot de passe',
      passwordKeep: 'Laisser vide pour ne pas changer',
      passwordHint: 'Au moins 8 caractères',
      save: 'Enregistrer',
      saved: 'Profil enregistré.',
      saveFail: 'Enregistrement impossible.',
      photoUpdated: 'Photo mise à jour.',
      photoFail: 'Photo illisible.',
      photoRemoved: 'Photo retirée : l’initiale du pseudo s’affiche.',
      photoRemoveFail: 'Impossible de retirer la photo.',
      prefs: 'Préférences',
      appearance: 'Apparence',
      appearanceHint: 'Jour ou nuit, sur cet appareil.',
      language: 'Langue',
      languageHint: 'Landing, e-mails et toute l’application.',
      google: 'Google',
      googleLinkedSheets: 'Compte lié. L’export Sheets est prêt.',
      googleLinkedRelink: 'Compte lié. Reliez-le à nouveau pour autoriser Sheets.',
      googleHint: 'Liez Google pour vous connecter plus vite et copier un tableur dans Sheets.',
      googleLink: 'Lier Google',
      billing: 'Abonnement',
      planActive: 'actif',
      planNone: 'aucun abonnement',
      memberSince: 'Membre depuis {date}',
      manageBilling: 'Gérer l’abonnement',
      shortcuts: 'Raccourcis',
      shortcutPalette: 'Palette de commandes',
      shortcutEsc: 'Fermer un panneau ou le guide',
      shortcutCtrlK: 'Ctrl K',
      shortcutEscKey: 'Échap',
      statsSessions: 'Sessions',
      statsSearches: 'Relevés',
      statsLeads: 'Fiches',
      statsSigned: 'Signés',
    },
    chrome: {
      logout: 'Se déconnecter',
      logoutAsk: 'Se déconnecter ?',
      logoutHint: 'Vous pourrez vous reconnecter à tout moment.',
      logoutBody: 'Fermer la session sur cet appareil ? Vos recherches et vos fiches restent enregistrées.',
      logoutConfirm: 'Se déconnecter',
      cancel: 'Annuler',
      day: 'jour',
      night: 'nuit',
      toDay: 'Passer en mode jour',
      toNight: 'Passer en mode nuit',
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
      app: 'Open the app',
      account: 'Account',
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
        d: 'City + trades. Prospy opens each listing, classifies the web, and pulls phone, address and owner name.',
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
      googleTitle: 'Why Prospy asks for a Google account',
      googleText:
        'Google sign-in is used to open your Prospy account (email and name). Google Sheets access is used only to create a spreadsheet of your surveys when you click export. Prospy does not read your other files, send email as you, or use this data for ads.',
      googlePrivacy: 'Privacy policy',
    },
    pricing: {
      chip: 'pricing',
      h2: 'One subscription, one tool.',
      lead: 'Each plan caps or unlocks survey volume, settings, team invites, and owner names. Prices below are the intended ones. Stripe is not wired yet, so nothing is limited in the tool for now.',
      month: 'per month',
      stripeOff: 'Stripe checkout comes later. The crossed items describe the offer; they are not enforced yet.',
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
      mapHint: '{city} · 47 pins',
      name: 'Name',
      phone: 'Phone',
      scoreCol: 'Score',
      owner: 'Owner',
      ownerMissing: 'Owner not found',
      source: 'Source',
    },
    footer: {
      blurb: 'Survey of local businesses with no website. Data per account, payments via Stripe.',
      product: 'product',
      account: 'account',
      look: 'appearance',
      legal: 'legal',
      terms: 'terms',
      privacy: 'privacy',
      copy: '© 2026 Prospy. All rights reserved.',
    },
    mascot: {
      home: 'I’ll walk you through the tool.',
      hero: 'These have no website. They’re the ones you call.',
      product: 'A city, some trades: a call list.',
      features: 'Survey, pipeline, calls, export. That’s it.',
      trust: 'Your cards stay on your account. Full stop.',
      pricing: 'Starter caps the survey. Pro unlocks the owner name. Agency lifts the ceiling.',
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
        invite: 'Invite a teammate here: username or email, then the arrow.',
      },
    },
    auth: {
      loginTitle: 'Log in',
      registerTitle: 'Create an account',
      loginLead: 'Username or email, plus your password. Google also unlocks Sheets export.',
      registerLead: 'Email, username and password. A code arrives by email before the tool opens.',
      email: 'email',
      username: 'username',
      photo: 'profile photo (optional)',
      photoHint: 'Otherwise we show the first letter of your username.',
      photoChoose: 'Choose a photo',
      photoRemove: 'Remove',
      identifier: 'username or email',
      password: 'password',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      strengthWeak: 'weak',
      strengthFair: 'fair',
      strengthGood: 'solid',
      strengthStrong: 'strong',
      termsPrefix: 'By continuing you agree to the',
      terms: 'terms of use',
      termsAnd: 'and the',
      privacy: 'privacy policy',
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
    settings: {
      docTitle: 'Account — Prospy',
      kicker: 'your account',
      title: 'Settings',
      lead: 'Photo, username, language, appearance. How you show up in shared sessions.',
      back: 'Back',
      backHome: 'Back to home',
      backSessions: 'Back to sessions',
      backSession: 'Back to the project',
      identity: 'Identity',
      changePhoto: 'Change photo',
      useInitial: 'Use initial',
      username: 'username',
      email: 'email',
      currentPassword: 'current password',
      newPassword: 'new password',
      addPassword: 'add a password',
      passwordKeep: 'Leave blank to keep it',
      passwordHint: 'At least 8 characters',
      save: 'Save',
      saved: 'Profile saved.',
      saveFail: 'Could not save.',
      photoUpdated: 'Photo updated.',
      photoFail: 'Could not read that photo.',
      photoRemoved: 'Photo removed: your username initial is shown.',
      photoRemoveFail: 'Could not remove the photo.',
      prefs: 'Preferences',
      appearance: 'Appearance',
      appearanceHint: 'Day or night, on this device.',
      language: 'Language',
      languageHint: 'Landing, emails and the whole app.',
      google: 'Google',
      googleLinkedSheets: 'Account linked. Sheets export is ready.',
      googleLinkedRelink: 'Account linked. Link it again to allow Sheets.',
      googleHint: 'Link Google to sign in faster and copy a sheet into Sheets.',
      googleLink: 'Link Google',
      billing: 'Billing',
      planActive: 'active',
      planNone: 'no subscription',
      memberSince: 'Member since {date}',
      manageBilling: 'Manage billing',
      shortcuts: 'Shortcuts',
      shortcutPalette: 'Command palette',
      shortcutEsc: 'Close a panel or the guide',
      shortcutCtrlK: 'Ctrl K',
      shortcutEscKey: 'Esc',
      statsSessions: 'Sessions',
      statsSearches: 'Surveys',
      statsLeads: 'Cards',
      statsSigned: 'Signed',
    },
    chrome: {
      logout: 'Log out',
      logoutAsk: 'Log out?',
      logoutHint: 'You can sign back in at any time.',
      logoutBody: 'Close the session on this device? Your surveys and cards stay saved.',
      logoutConfirm: 'Log out',
      cancel: 'Cancel',
      day: 'day',
      night: 'night',
      toDay: 'Switch to day mode',
      toNight: 'Switch to night mode',
    },
  },
} as const;

type Copy = (typeof copy)[Locale];

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (next: Locale) => void;
  m: Copy;
} | null>(null);

function browserLocale(): Locale {
  const tags = [navigator.language, ...(navigator.languages ?? [])]
    .filter(Boolean)
    .map((tag) => tag.toLowerCase());
  for (const tag of tags) {
    if (tag === 'fr' || tag.startsWith('fr-')) return 'fr';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return 'fr';
}

function readLocale(): Locale {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === 'en' || stored === 'fr') return stored;
  } catch {
    /* ignore */
  }
  return browserLocale();
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => (typeof document === 'undefined' ? 'fr' : readLocale()));
  const swapTimer = useRef(0);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => () => window.clearTimeout(swapTimer.current), []);

  const setLocale = (next: Locale) => {
    if (next === locale) return;
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const apply = () => {
      setLocaleState(next);
      localStorage.setItem(KEY, next);
      root.lang = next;
    };
    window.clearTimeout(swapTimer.current);
    if (reduced) {
      root.classList.remove('is-lang-out', 'is-lang-in');
      apply();
      return;
    }
    const shots = snapshotLangBoxes();
    root.classList.remove('is-lang-in');
    root.classList.add('is-lang-out');
    swapTimer.current = window.setTimeout(() => {
      try {
        flushSync(apply);
      } catch {
        apply();
      }
      requestAnimationFrame(() => {
        root.classList.remove('is-lang-out', 'is-lang-in');
        void root.offsetWidth;
        root.classList.add('is-lang-in');
        morphLangBoxes(shots);
        swapTimer.current = window.setTimeout(() => root.classList.remove('is-lang-in'), 780);
      });
    }, 240);
  };

  return <LocaleContext.Provider value={{ locale, setLocale, m: copy[locale] }}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useI18n must be used inside LocaleProvider');
  return ctx;
}
