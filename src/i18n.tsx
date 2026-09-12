import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { morphLangBoxes, snapshotLangBoxes } from './lib/langMorph';

export type Locale = 'fr' | 'en';

const KEY = 'prospy.lang';

const copy = {
  fr: {
    title: 'Prospy. La prospection à son paroxysme',
    nav: {
      product: 'Produit',
      features: 'Fonctionnalités',
      trust: 'Sécurité',
      pricing: 'Tarifs',
      login: 'Connexion',
      start: 'Essayer',
      app: 'Ouvrir l’app',
      account: 'Compte',
      lang: 'Langue',
      menu: 'Menu',
      close: 'Fermer',
    },
    hero: {
      chip: '+3 480 prospects trouvés en une seule journée',
      h1a: 'La prospection',
      h1b: 'à son paroxysme',
      lead: 'Prospy ouvre les fiches Google Maps à votre place. Ceux sans site restent, avec téléphone, adresse et dirigeant pour enchaîner les appels.',
      cta: 'Créer un compte',
      see: 'Voir comment',
      leadShort: 'Un relevé Maps, seulement les commerces sans site. Ensuite vous appelez depuis le pipeline.',
      traits: [
        { k: 'zap', title: 'Rapide' },
        { k: 'shield', title: 'Fiable' },
        { k: 'target', title: 'Efficace' },
        { k: 'spark', title: 'Simple' },
      ],
    },
    steps: [
      {
        k: '01',
        t: 'Constat',
        d: 'Beaucoup de bons commerces locaux n’ont pas de site. Les chercher à la main dans Maps, c’est des heures perdues.',
      },
      {
        k: '02',
        t: 'Relevé',
        d: 'Vous indiquez la ville et les métiers. Prospy ouvre chaque fiche, vérifie le web, note le téléphone et l’adresse.',
      },
      {
        k: '03',
        t: 'Appels',
        d: 'Vous recevez une liste triée, une carte, un export. Plus besoin de cliquer fiche par fiche.',
      },
    ],
    product: {
      chip: 'tri automatique',
      h2: 'On écarte ceux qui ont déjà un site.',
      lead: 'Prospy ouvre chaque fiche Maps et cherche s’il y a un vrai site. Un site vitrine, on passe. Une page Facebook ou rien du tout, le commerce reste dans votre liste.',
    },
    sieve: {
      label: 'tri du web · live',
      opened: 'fiches ouvertes',
      dropped: 'écartées',
      kept: 'retenues',
      keep: 'retenu',
      drop: 'écarté',
      kinds: {
        site: 'site vitrine actif',
        social: 'page Facebook seule',
        directory: 'fiche annuaire',
        parked: 'domaine parqué, page vide',
        none: 'aucun lien trouvé',
      },
      note: 'Un vrai site sort. Une page Facebook ou un annuaire, ça reste. Le patron n’a toujours pas de site à lui.',
    },
    band: {
      label: 'carte',
      title: 'Par quartier.',
      note: 'Chaque point est une adresse sans site. La couleur indique le potentiel. Vous enchaînez quartier par quartier.',
      hot: 'prioritaire',
      warm: 'correct',
      cold: 'plus tard',
    },
    preview: {
      chip: 'dans l’outil',
      h2: 'Dans l’outil.',
      lead: 'Une liste d’appels, pas un tableur. Les captures ci dessous viennent du vrai logiciel.',
    },
    features: {
      chip: 'fonctionnalités',
      h2: 'L’essentiel.',
      items: [
        {
          title: 'Relevé Maps',
          text: 'Ville et métiers. Seuls les commerces sans vrai site restent dans la liste.',
          why: 'Plus de clic manuel dans Maps.',
        },
        {
          title: 'Pipeline',
          text: 'À trier, favoris, signés, perdus. Une fiche traitée ne revient pas.',
          why: 'Le suivi tient en un geste.',
        },
        {
          title: 'Appels',
          text: 'Une fiche plein écran, notes au fil de l’eau, touches S et N pour classer.',
          why: 'Vous restez au téléphone.',
        },
        {
          title: 'Carte et export',
          text: 'GPS sur la carte, Excel, CSV français, copie vers Google Sheets.',
          why: 'Le relevé sort quand vous en avez besoin.',
        },
      ],
      why: 'Concrètement.',
    },
    launch: {
      chip: 'premier relevé',
      h2: 'Ville et métiers.',
      lead: 'Prospy parcourt Maps, filtre les sites existants et vous rend une liste d’appels classée.',
      run: 'Lancer',
    },
    trust: {
      chip: 'sécurité',
      h2: 'En place.',
      lead: 'Pas de badge marketing inventé. Pour une mise en production large, un audit reste de mise.',
      items: [
        {
          title: 'Secrets serveur',
          text: 'Clés Stripe et scraper restent sur le serveur, jamais dans le navigateur.',
        },
        {
          title: 'Comptes isolés',
          text: 'Changer un numéro dans l’URL ne montre pas les fiches d’un autre compte.',
        },
        {
          title: 'Paiements Stripe',
          text: 'La carte est saisie chez Stripe. Prospy ne garde rien côté bancaire.',
        },
        {
          title: 'Sessions sécurisées',
          text: 'Cookie SameSite=Lax. Mots de passe dérivés avec scrypt.',
        },
      ],
      googleTitle: 'Lien Google',
      googleText:
        'La connexion Google ouvre votre compte Prospy (mail et nom). L’accès Sheets sert uniquement quand vous exportez un relevé. Prospy ne lit pas vos fichiers, n’envoie pas de mail à votre place et ne revend rien.',
      googlePrivacy: 'Politique de confidentialité',
    },
      pricing: {
      chip: 'tarifs',
      h2: 'Les tarifs.',
      lead: 'Chaque offre lève des plafonds. Volume de relevé, réglages, équipe, nom du dirigeant.',
      month: 'par mois',
      year: 'par an',
      monthly: 'Mensuel',
      yearly: 'Annuel',
      yearlyHint: '2 mois offerts',
    },
    cta: {
      h2: 'Passez aux appels.',
      lead: 'Créez un compte, lancez un relevé, triez, appelez. Même apparence jour et nuit que dans l’outil.',
      create: 'Créer un compte',
      open: 'Ouvrir l’app',
    },
    mock: {
      newSearch: 'nouvelle recherche',
      runSurvey: 'Lancer le relevé',
      noSite: 'sans site · 47',
      noSiteTag: 'sans site',
      score: 'feu de potentiel',
      export: 'export · csv / excel',
      name: 'Nom',
      phone: 'Tél',
      scoreCol: 'Score',
      owner: 'Dirigeant',
      ownerMissing: 'Dirigeant non trouvé',
      source: 'Source',
    },
    footer: {
      blurb: 'Relevé de commerces locaux sans site. Vos données restent sur votre compte. Paiement via Stripe.',
      product: 'produit',
      account: 'compte',
      look: 'apparence',
      legal: 'légal',
      terms: 'conditions',
      privacy: 'confidentialité',
      copy: '© 2026 Prospy. Tous droits réservés.',
    },
    mascot: {
      home: 'Clique ici, je te montre.',
      hero: 'Pas de site ? Souvent un bon numéro à composer.',
      steps: 'Tu choisis la zone, je filtre, tu appelles.',
      product: 'J’ouvre chaque fiche Maps et je jette ceux qui ont déjà un site.',
      band: 'Regroupe par quartier pour enchaîner les appels.',
      features: 'Relevé, tri, appels, export. Rien de plus.',
      launch: 'Une ville, un métier, ta liste est prête.',
      trust: 'Tes fiches restent chez toi, privées.',
      pricing: 'À partir de 29 €. Tu changes quand tu veux.',
      cta: 'Crée un compte, lance un relevé. Deux minutes.',
      dock: 'Tu as parcouru la page ? On lance ?',
      click: [
        'On lance un relevé ?',
        'Je garde seulement ceux sans site.',
        'Ta liste d’appels est plus bas.',
        'Sans site, souvent bon appel.',
        'Encore un clic, je continue.',
      ],
    },
    guide: {
      skip: 'Passer',
      next: 'Suivant',
      done: 'Compris',
      steps: {
        logo: 'Moi c’est Prospy. Je te montre l’outil en trente secondes.',
        search: 'Ville et métiers. C’est tout pour un relevé.',
        launch: 'Tu lances. Je ne garde que les commerces sans site.',
        results: 'Les fiches arrivent ici. L’étoile, c’est pour rappeler.',
        pipeline: 'À trier, favoris, signés. Ton pipeline est là.',
        invite: 'Ici tu invites quelqu’un. Pseudo ou mail, puis la flèche.',
      },
    },
    auth: {
      loginTitle: 'Connexion',
      registerTitle: 'Créer un compte',
      loginLead: 'Pseudo ou mail, plus le mot de passe. Google débloque aussi l’export Sheets.',
      registerLead: 'Mail, pseudo et mot de passe. Un code arrive par mail avant d’entrer dans l’outil.',
      email: 'mail',
      username: 'pseudo',
      photo: 'photo de profil (optionnel)',
      photoHint: 'Sinon on affiche l’initiale de votre pseudo.',
      photoChoose: 'Choisir une photo',
      photoRemove: 'Retirer',
      identifier: 'pseudo ou mail',
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
      fail: 'Connexion impossible.',
      google: 'Continuer avec Google',
      orEmail: 'ou par mail',
      forgot: 'Mot de passe oublié ?',
      forgotTitle: 'Mot de passe oublié',
      forgotLead: 'Indiquez pseudo ou mail. Un code part sur l’adresse du compte.',
      forgotSubmit: 'Envoyer le code',
      forgotSent: 'Si le compte existe, le code est parti. Regardez votre boîte mail.',
      newPassword: 'nouveau mot de passe',
      resetSubmit: 'Enregistrer le mot de passe',
      codeTitle: 'Code reçu par mail',
      codeLead: 'Six chiffres, valables dix minutes.',
      code: 'code',
      codeSubmit: 'Valider le code',
      resend: 'Renvoyer le code',
      resent: 'Un nouveau code vient d’être envoyé.',
      back: 'Retour',
    },
    settings: {
      docTitle: 'Compte. Prospy',
      kicker: 'votre compte',
      title: 'Réglages',
      lead: 'Photo, pseudo, langue, apparence. Ce que les autres voient dans une session partagée.',
      back: 'Retour',
      backHome: 'Retour à l’accueil',
      backSessions: 'Retour aux sessions',
      backSession: 'Retour au projet',
      identity: 'Identité',
      changePhoto: 'Changer la photo',
      recentPhotos: 'Photos récentes',
      recentPhotosHint: 'Les anciennes photos restent ici pour revenir en un clic.',
      cropTitle: 'Rogner la photo',
      cropHint: 'Glissez et zoomez pour cadrer le visage.',
      cropZoom: 'Zoom',
      cropApply: 'Appliquer',
      cropCancel: 'Annuler',
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
      photoRemoved: 'Photo retirée. L’initiale du pseudo s’affiche.',
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
      planDeveloper: 'compte développeur',
      memberSince: 'Membre depuis {date}',
      manageBilling: 'Gérer l’abonnement',
      cancelBilling: 'Résilier',
      cancelBillingAsk: 'Résilier l’abonnement ?',
      cancelBillingHint: 'Vous gardez l’accès jusqu’à la fin de la période déjà payée.',
      cancelBillingConfirm: 'Résilier',
      cancelBillingDone: 'Résiliation prévue. L’accès reste ouvert jusqu’au {date}.',
      cancelBillingFail: 'Impossible de résilier pour le moment.',
      cancelBillingNone: 'Aucun abonnement Stripe à résilier.',
      guide: 'Guide',
      guideHint: 'Revoir la visite guidée dans l’application.',
      guideReplay: 'Relancer le guide',
      guideReplayDone: 'Le guide reprendra à la prochaine ouverture d’une session.',
      legal: 'Mentions légales',
      legalHint: 'Confidentialité et conditions d’utilisation.',
      privacyLink: 'Confidentialité',
      termsLink: 'CGU',
      contact: 'Aide',
      contactHint: 'Une question sur votre compte ou l’outil.',
      contactEmail: 'contact@prospy.fr',
      shortcuts: 'Raccourcis',
      shortcutsGlobal: 'Partout',
      shortcutsPalette: 'Dans la palette',
      shortcutsCalls: 'Mode appels',
      shortcutPalette: 'Palette de commandes',
      shortcutEsc: 'Fermer un panneau ou le guide',
      shortcutNav: 'Naviguer dans la liste',
      shortcutEnter: 'Valider la sélection',
      shortcutCallNext: 'Fiche suivante',
      shortcutCallPrev: 'Fiche précédente',
      shortcutCallSigned: 'Marquer signé',
      shortcutCallLost: 'Marquer perdu',
      shortcutCallFav: 'Ajouter aux favoris',
      shortcutCtrlJ: 'Ctrl J',
      shortcutEscKey: 'Échap',
      shortcutArrowKeys: '↑ ↓',
      shortcutEnterKey: 'Entrée',
      shortcutCallNextKeys: '→ Espace',
      shortcutCallPrevKey: '←',
      shortcutCallSignedKey: 'S',
      shortcutCallLostKey: 'N',
      shortcutCallFavKey: 'F',
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
    title: 'Prospy. Prospecting at its peak',
    nav: {
      product: 'Product',
      features: 'Features',
      trust: 'Security',
      pricing: 'Pricing',
      login: 'Log in',
      start: 'Try it',
      app: 'Open the app',
      account: 'Account',
      lang: 'Language',
      menu: 'Menu',
      close: 'Close',
    },
    hero: {
      chip: '+3,480 prospects found in a single day',
      h1a: 'Prospecting',
      h1b: 'at its peak',
      lead: 'Prospy opens Google Maps listings for you. Real websites drop off. You keep the phone number, address and owner to work through your calls.',
      cta: 'Create account',
      see: 'See how',
      leadShort: 'A Maps survey, only shops with no website. Then you call from the pipeline.',
      traits: [
        { k: 'zap', title: 'Fast' },
        { k: 'shield', title: 'Reliable' },
        { k: 'target', title: 'Efficient' },
        { k: 'spark', title: 'Simple' },
      ],
    },
    steps: [
      {
        k: '01',
        t: 'Reality',
        d: 'Many good local shops have no website. Finding them by hand in Maps eats hours.',
      },
      {
        k: '02',
        t: 'Survey',
        d: 'You pick city and trades. Prospy opens each listing, checks the web, grabs phone and address.',
      },
      {
        k: '03',
        t: 'Calls',
        d: 'You get a sorted list, a map, an export. No more clicking listing by listing.',
      },
    ],
    product: {
      chip: 'auto triage',
      h2: 'We drop shops that already have a website.',
      lead: 'Prospy opens each Maps listing and looks for a real website. A live site, we skip it. Facebook only or nothing at all, the shop stays on your list.',
    },
    sieve: {
      label: 'web triage · live',
      opened: 'listings opened',
      dropped: 'dropped',
      kept: 'kept',
      keep: 'kept',
      drop: 'dropped',
      kinds: {
        site: 'live business website',
        social: 'Facebook page only',
        directory: 'directory listing',
        parked: 'parked domain, empty page',
        none: 'no link anywhere',
      },
      note: 'A real website goes in the bin. A Facebook page or a directory listing stays a prospect, because the owner still has nothing of their own.',
    },
    band: {
      label: 'ground',
      title: 'By area.',
      note: 'Every pin is an address with no website. The colour gives the potential, and you group your calls neighbourhood by neighbourhood.',
      hot: 'call first',
      warm: 'solid',
      cold: 'later',
    },
    preview: {
      chip: 'preview',
      h2: 'In the app.',
      lead: 'A call list, not a spreadsheet. The windows below are the actual software, not decoration.',
    },
    features: {
      chip: 'features',
      h2: 'The core.',
      items: [
        {
          title: 'Maps survey',
          text: 'City and trades. Only shops with no real website stay on the list.',
          why: 'No manual clicking in Maps.',
        },
        {
          title: 'Pipeline',
          text: 'Inbox, starred, signed, lost. A handled card does not return.',
          why: 'Follow-up in one move.',
        },
        {
          title: 'Call mode',
          text: 'One card full screen, notes as you go, S and N keys to classify.',
          why: 'You stay on the phone.',
        },
        {
          title: 'Map and export',
          text: 'GPS on the map, Excel, French CSV, copy to Google Sheets.',
          why: 'The survey leaves when you need it.',
        },
      ],
      why: 'In practice.',
    },
    launch: {
      chip: 'first survey',
      h2: 'City and trades.',
      lead: 'Prospy walks Maps, filters existing sites and returns a ranked call list.',
      run: 'Run',
    },
    trust: {
      chip: 'security',
      h2: 'In place.',
      lead: 'No fake marketing badges. For large production, an audit still makes sense.',
      items: [
        {
          title: 'Server secrets',
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
          title: 'Secure sessions',
          text: 'SameSite=Lax cookie. Passwords derived with scrypt.',
        },
      ],
      googleTitle: 'Google link',
      googleText:
        'Google sign-in is used to open your Prospy account (email and name). Google Sheets access is used only to create a spreadsheet of your surveys when you click export. Prospy does not read your other files, send email as you, or use this data for ads.',
      googlePrivacy: 'Privacy policy',
    },
    pricing: {
      chip: 'pricing',
      h2: 'Pricing.',
      lead: 'Each plan caps or unlocks survey volume, settings, team invites, and owner names.',
      month: 'per month',
      year: 'per year',
      monthly: 'Monthly',
      yearly: 'Yearly',
      yearlyHint: '2 months free',
    },
    cta: {
      h2: 'Start calling.',
      lead: 'Create an account, run a survey, sort, call. Same day and night look as in the app.',
      create: 'Create an account',
      open: 'Open the app',
    },
    mock: {
      newSearch: 'new search',
      runSurvey: 'Run the survey',
      noSite: 'no website · 47',
      noSiteTag: 'no website',
      score: 'potential score',
      export: 'export · csv / excel',
      name: 'Name',
      phone: 'Phone',
      scoreCol: 'Score',
      owner: 'Owner',
      ownerMissing: 'Owner not found',
      source: 'Source',
    },
    footer: {
      blurb: 'Survey of local shops with no website. Your data stays on your account. Paid via Stripe.',
      product: 'product',
      account: 'account',
      look: 'appearance',
      legal: 'legal',
      terms: 'terms',
      privacy: 'privacy',
      copy: '© 2026 Prospy. All rights reserved.',
    },
    mascot: {
      home: 'Click here, I’ll show you.',
      hero: 'No website? Often a good number to dial.',
      steps: 'Pick an area, I filter, you call.',
      product: 'I open each Maps listing and drop anyone with a real site.',
      band: 'Group by neighbourhood to chain your calls.',
      features: 'Survey, triage, calls, export. That’s it.',
      launch: 'One city, one trade, your list is ready.',
      trust: 'Your cards stay on your account, private.',
      pricing: 'From 29 €. Switch whenever you want.',
      cta: 'Create an account, run a survey. Two minutes.',
      dock: 'Seen the page? Ready to run one?',
      click: [
        'Run a survey?',
        'I only keep shops with no website.',
        'Your call list is further down.',
        'No site often means a good call.',
        'One more click, I keep going.',
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
        invite: 'Invite a teammate here. Username or email, then the arrow.',
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
      forgotLead: 'Enter your username or email. A code is sent to the account’s address.',
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
      docTitle: 'Account. Prospy',
      kicker: 'your account',
      title: 'Settings',
      lead: 'Photo, username, language, appearance. What others see in a shared session.',
      back: 'Back',
      backHome: 'Back to home',
      backSessions: 'Back to sessions',
      backSession: 'Back to the project',
      identity: 'Identity',
      changePhoto: 'Change photo',
      recentPhotos: 'Recent photos',
      recentPhotosHint: 'Past profile photos stay here for one-click switching.',
      cropTitle: 'Crop photo',
      cropHint: 'Drag and zoom to frame your face.',
      cropZoom: 'Zoom',
      cropApply: 'Apply',
      cropCancel: 'Cancel',
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
      photoRemoved: 'Photo removed. Your username initial is shown.',
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
      planDeveloper: 'developer account',
      memberSince: 'Member since {date}',
      manageBilling: 'Manage billing',
      cancelBilling: 'Cancel plan',
      cancelBillingAsk: 'Cancel your subscription?',
      cancelBillingHint: 'You keep access until the end of the period already paid.',
      cancelBillingConfirm: 'Cancel plan',
      cancelBillingDone: 'Cancellation scheduled. Access stays open until {date}.',
      cancelBillingFail: 'Could not cancel right now.',
      cancelBillingNone: 'No Stripe subscription to cancel.',
      guide: 'Guide',
      guideHint: 'Replay the in-app walkthrough.',
      guideReplay: 'Restart guide',
      guideReplayDone: 'The guide will resume next time you open a session.',
      legal: 'Legal',
      legalHint: 'Privacy policy and terms of use.',
      privacyLink: 'Privacy',
      termsLink: 'Terms',
      contact: 'Help',
      contactHint: 'Questions about your account or the tool.',
      contactEmail: 'contact@prospy.fr',
      shortcuts: 'Shortcuts',
      shortcutsGlobal: 'Everywhere',
      shortcutsPalette: 'In the palette',
      shortcutsCalls: 'Call mode',
      shortcutPalette: 'Command palette',
      shortcutEsc: 'Close a panel or the guide',
      shortcutNav: 'Move through the list',
      shortcutEnter: 'Confirm selection',
      shortcutCallNext: 'Next card',
      shortcutCallPrev: 'Previous card',
      shortcutCallSigned: 'Mark signed',
      shortcutCallLost: 'Mark lost',
      shortcutCallFav: 'Add to favorites',
      shortcutCtrlJ: 'Ctrl J',
      shortcutEscKey: 'Esc',
      shortcutArrowKeys: '↑ ↓',
      shortcutEnterKey: 'Enter',
      shortcutCallNextKeys: '→ Space',
      shortcutCallPrevKey: '←',
      shortcutCallSignedKey: 'S',
      shortcutCallLostKey: 'N',
      shortcutCallFavKey: 'F',
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
