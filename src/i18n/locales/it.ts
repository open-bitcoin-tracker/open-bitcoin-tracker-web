import type { Dict } from '../ui';

export const it: Dict = {
  meta: {
    landing: {
      title: 'Open Bitcoin Tracker — Strumenti Bitcoin e app Android',
      description: 'Monitora il prezzo di Bitcoin in tempo reale, esplora i grafici storici e A Bit of Earth o usa Video Mode. Strumenti gratuiti e open source e un’app di portfolio Android attenta alla privacy.',
    },
    home: {
      title: 'Open Bitcoin Tracker per Android',
      description:
        'Un’app Android open source e attenta alla privacy per monitorare il valore dei tuoi stack di Bitcoin. Niente account, niente analisi, niente telemetria.',
    },
    about: {
      title: 'Informazioni — Open Bitcoin Tracker',
      description:
        'Scopri gli strumenti Bitcoin gratuiti e open source e l’app di portfolio Android di Open Bitcoin Tracker, con informazioni sul progetto e fonti dei dati.',
    },
    privacy: {
      title: 'Informativa sulla privacy — Open Bitcoin Tracker',
      description:
        'Informativa sulla privacy di Open Bitcoin Tracker: un’app Android open source e attenta alla privacy per monitorare il valore dei tuoi stack di Bitcoin.',
    },
    ogImageAlt: 'Open Bitcoin Tracker — strumenti Bitcoin gratuiti e open source e app Android',
    socialTagline: 'Strumenti Bitcoin gratuiti e open source',
  },

  landing: {
    toolsLabel: 'Esplora gli strumenti',
    openChart: 'Apri il grafico',
    openEarth: 'Esplora la mappa',
    openVideo: 'Crea l’atmosfera',
    openApp: 'Scarica l’app Android',
    appDescription: 'Monitora il tuo portfolio Bitcoin. Nessun account. I tuoi stack restano sul tuo telefono.',
    priceTracker: 'Tracker del prezzo',
    priceDescription: 'Prezzo di Bitcoin in tempo reale e storico dal 2010.',
    videoDescription: 'Il prezzo di Bitcoin in tempo reale sui video di YouTube',
    earthDescription: 'Esplora Bitcoin come una quota della superficie terrestre.',
    supplyDescription: 'Scopri come l’offerta di moneta fiat aumenta ogni anno e quella di bitcoin no.',
  },

  nav: {
    partyMode: 'Party Mode',
    videoMode: 'Video Mode',
    menuLabel: 'Menu',
    closeMenu: 'Chiudi menu',
    skipToContent: 'Vai al contenuto',
    mainAria: 'Navigazione principale',
    github: 'GitHub',
    githubAria: 'Repository GitHub',
    download: 'Scarica',
    langLabel: 'Lingua',
    themeLabel: 'Tema',
    themeAuto: 'Automatico',
    themeDark: 'Modalità scura',
    themeLight: 'Modalità chiara',
  },

  hero: {
    subtitle: 'Tracker di portfolio bitcoin open source per Android',
    tagline: 'Tracker di portfolio bitcoin open source per Android.',
    downloadApk: 'Scarica l’APK',
    viewGithub: 'Vedi su GitHub',
    viewZapstore: 'Zapstore',
    altPrefix: 'Open Bitcoin Tracker — ',
    altSuffix: '',
    reasons: [
      {
        title: 'Privacy totale',
        body: 'A OBT non servono né seed né chiavi. Le quantità di bitcoin si inseriscono a mano e non lasciano mai il tuo telefono.',
      },
      {
        title: 'Veloce e leggero',
        body: 'OBT non si connette a nessun nodo: si avvia in un attimo e quasi non tocca la batteria.',
      },
    ],
  },

  themes: {
    heading: 'Hodl con stile',
    sub: 'Quattro temi che seguono automaticamente la modalità del tuo sistema.',
    regionAria: 'Temi dell’app',
    showAria: 'Mostra lo screenshot di {label}',
    altPrefix: 'Open Bitcoin Tracker — ',
    altSuffix: '',
    labels: ['Paper Cream', 'Salmon Press', 'Deepsea Blue', 'OLED Black'],
  },

  prices: {
    heading: 'Prezzi passati e futuri',
    sub: 'Analizza le tendenze storiche e proietta il valore futuro.',
    cards: [
      { title: 'Monitoraggio dei prezzi storici', body: 'Analizza i dati storici sui prezzi di Bitcoin.' },
      { title: 'Strumenti di proiezione futura', body: 'Simula il valore in base ai prezzi target.' },
    ],
  },

  privacy: {
    heading: 'Privacy totale',
    sub: 'I tuoi dati restano sul tuo telefono.',
    cards: [
      { title: 'Nessun account', body: 'Nessuna registrazione. Installa l’app e inizia a monitorare.' },
      { title: 'Nessun tracciamento', body: 'Zero analisi, niente pubblicità, niente fingerprinting.' },
      { title: 'Solo sul dispositivo', body: 'I tuoi stack restano sul tuo telefono. Non viene caricato nulla.' },
      { title: 'Open source', body: 'Licenza MIT. Don’t trust, verify.' },
    ],
  },

  kao: {
    body: 'Da settembre 2026, Google richiederà a ogni sviluppatore Android di registrarsi e verificare la propria identità, anche per le app installate al di fuori del Play Store. Questo minaccia le app open source come questa.',
    linkText: 'Scopri di più su keepandroidopen.org',
  },

  footer: {
    copyright: '© 2026 · Licenza MIT',
    appHeader: 'App',
    projectHeader: 'Progetto',
    about: 'Informazioni',
    privacy: 'Informativa sulla privacy',
    github: 'GitHub',
    reportBug: 'Segnala un bug',
  },

  about: {
    h1: 'Informazioni',
    storyHeader: 'Perché ho creato OBT',
    story: [
      'Ho creato Open Bitcoin Tracker perché volevo un modo comodo per tenere d’occhio più stack. Non ho bisogno di fare transazioni, solo di seguirne il valore. La maggior parte dei wallet ne gestisce uno solo o è lenta perché deve collegarsi a un node.',
      'Alla fine l’hanno usata anche la mia famiglia e i miei amici, così l’ho resa pubblica nel caso possa servire ad altri.',
    ],
    dataSourcesHeader: 'Fonti dei dati dell’app Android',
    note: 'L’app non ha alcuna associazione con questi fornitori.',
    licenses: 'Licenza MIT su GitHub',
    madeBy: 'Di Max Hodler',
    forGrandma: 'Per mia nonna 🌼',
    profileHeader: 'Creato da Max Hodler',
    followAria: 'Max Hodler su X',
    primalAria: 'Max Hodler su Primal',
    dataSourceLabels: ['Prezzi attuali', 'Prezzi storici', 'Tassi di cambio storici', 'Mempool e hashrate'],
  },

  policy: {
    h1: 'Informativa sulla privacy',
    lastUpdated: 'Ultimo aggiornamento: 26 maggio 2026',
    intro:
      'Questa informativa descrive quali dati l’applicazione Android Open Bitcoin Tracker («l’app») elabora, archivia e trasmette. L’app è pubblicata come software open source con licenza MIT.',
    sections: [
      {
        heading: '1. Sintesi',
        paras: [
          'L’app non raccoglie dati personali. Non ci sono account utente, analisi, identificatori pubblicitari né telemetria. Tutti i dati che inserisci nell’app restano sul tuo dispositivo.',
        ],
      },
      {
        heading: '2. Dati archiviati sul tuo dispositivo',
        paras: [
          'Le seguenti informazioni sono archiviate localmente nella memoria privata dell’app e non vengono trasmesse a nessun server gestito dallo sviluppatore:',
        ],
        list: [
          'I nomi degli stack e gli importi del saldo in Bitcoin che inserisci.',
          'Le preferenze dell’applicazione e le impostazioni di visualizzazione.',
          'La configurazione facoltativa di sblocco tramite PIN o biometria, conservata nell’Android Keystore.',
        ],
        parasAfter: [
          'Il backup automatico di Android su Google Drive è disattivato per questa applicazione, quindi i dati archiviati localmente non vengono copiati sui server di Google tramite tale meccanismo.',
        ],
      },
      {
        heading: '3. Richieste di rete',
        paras: [
          'Per mostrare i dati di mercato e le informazioni on-chain, l’app effettua richieste ai seguenti servizi di terze parti. A queste richieste non viene allegato alcun identificatore di account, identificatore di dispositivo o parametro di tracciamento.',
        ],
        list: [
          'Kraken — dati di prezzo del BTC in tempo reale (WebSocket).',
          'mempool.space — altezza dei blocchi, commissioni mediane e stime sui blocchi.',
          'Coin Metrics — hashrate storico della rete.',
          'Banca centrale europea — tassi di cambio fiat di riferimento giornalieri.',
        ],
        parasAfter: [
          'Questi fornitori riceveranno necessariamente l’indirizzo IP del dispositivo richiedente. Il loro trattamento di tali informazioni è disciplinato dalle rispettive informative sulla privacy.',
        ],
      },
      {
        heading: '4. Dati non raccolti',
        paras: ['L’app non raccoglie, trasmette né archivia nessuno dei seguenti dati:'],
        list: [
          'Account utente, credenziali di accesso o indirizzi e-mail.',
          'Dati di analisi o di utilizzo del prodotto (ad es. Firebase Analytics, Sentry, Mixpanel).',
          'Identificatori pubblicitari o SDK pubblicitari.',
          'Report di arresto anomalo fuori dal dispositivo.',
        ],
      },
      {
        heading: '5. Autorizzazioni',
        paras: ['L’app richiede le seguenti autorizzazioni Android:'],
        list: [
          'Internet — necessaria per recuperare i dati di mercato e le informazioni della mempool.',
          'Autenticazione biometrica (facoltativa) — quando è attivata, l’app usa l’API BiometricPrompt di Android per sbloccarsi localmente. I dati biometrici sono gestiti dal sistema operativo Android; l’app non li riceve né li archivia mai.',
        ],
        parasAfter: [
          'L’app non richiede l’accesso a contatti, posizione, fotocamera, microfono né all’archiviazione di file generale.',
        ],
      },
      {
        heading: '6. Codice sorgente',
        paras: [
          'Il codice sorgente completo dell’app è disponibile pubblicamente e può essere verificato, compilato o modificato in modo indipendente secondo i termini della licenza MIT.',
        ],
        repoLabel: 'Repository:',
      },
      {
        heading: '7. Minori',
        paras: [
          'L’app non è destinata ai minori. Poiché non raccoglie dati personali, non tratta consapevolmente dati personali di minori di qualsiasi età.',
        ],
      },
      {
        heading: '8. Modifiche a questa informativa',
        paras: [
          'Se questa informativa viene aggiornata, la versione rivista sarà pubblicata su questa pagina e la data «Ultimo aggiornamento» qui sopra sarà modificata per riflettere la data della modifica. Eventuali modifiche sostanziali alle pratiche di trattamento dei dati saranno riportate qui.',
        ],
      },
      {
        heading: '9. Contatti',
        contactBefore: 'Le domande relative a questa informativa possono essere inviate come issue sul repository del progetto:',
        contactAfter: '.',
      },
    ],
  },
};
