import type { Dict } from '../ui';

export const tr: Dict = {
  meta: {
    landing: {
      title: 'Open Bitcoin Tracker — Bitcoin Araçları ve Android Uygulaması',
      description: 'Canlı Bitcoin fiyatını takip et, geçmiş fiyat grafiklerini ve A Bit of Earth’ü keşfet ya da Video Mode’u kullan. Ücretsiz, açık kaynaklı araçlar ve gizliliğe önem veren bir Android portföy uygulaması.',
    },
    home: {
      title: 'Android için Open Bitcoin Tracker',
      description:
        "Bitcoin stack'lerinizin değerini takip etmek için gizliliğe önem veren, açık kaynaklı bir Android uygulaması. Hesap yok, analiz yok, telemetri yok.",
    },
    about: {
      title: 'Hakkında — Open Bitcoin Tracker',
      description:
        'Open Bitcoin Tracker’ın ücretsiz, açık kaynaklı Bitcoin araçlarını ve Android portföy uygulamasını keşfet. Proje bilgileri ve veri kaynakları.',
    },
    privacy: {
      title: 'Gizlilik Politikası — Open Bitcoin Tracker',
      description:
        "Open Bitcoin Tracker için gizlilik politikası: Bitcoin stack'lerinizin değerini takip etmek için gizliliğe önem veren, açık kaynaklı bir Android uygulaması.",
    },
    ogImageAlt: 'Open Bitcoin Tracker — ücretsiz, açık kaynaklı Bitcoin araçları ve Android uygulaması',
    socialTagline: 'Ücretsiz, açık kaynaklı Bitcoin araçları',
  },

  landing: {
    intro: 'Bitcoin fiyatını takip etmek ve Bitcoin’i farklı açılardan keşfetmek için ücretsiz, açık kaynaklı araçlar.',
    priceTracker: 'Fiyat takibi',
    priceDescription: 'Canlı Bitcoin fiyatı ve 2010’dan bu yana fiyat geçmişi.',
    videoDescription: 'YouTube videolarının üzerinde canlı Bitcoin fiyatı',
    earthDescription: 'Bitcoin’i Dünya’nın kara yüzeyinin bir payı olarak keşfet.',
    supplyDescription: 'İtibari para arzının her yıl nasıl arttığını ve bitcoin arzının artmadığını gör.',
  },

  nav: {
    partyMode: 'Party Mode',
    videoMode: 'Video Mode',
    menuLabel: 'Menü',
    closeMenu: 'Menüyü kapat',
    skipToContent: 'İçeriğe geç',
    mainAria: 'Ana gezinme',
    github: 'GitHub',
    githubAria: 'GitHub deposu',
    download: 'İndir',
    langLabel: 'Dil',
    themeToggleAria: 'Karanlık modu aç/kapat',
    themeDark: 'Karanlık mod',
    themeLight: 'Aydınlık mod',
  },

  hero: {
    subtitle: 'Android için açık kaynaklı bitcoin portföy takipçisi',
    tagline: 'Android için açık kaynaklı bitcoin portföy takipçisi.',
    downloadApk: 'APK indir',
    viewGithub: "GitHub'da görüntüle",
    viewZapstore: 'Zapstore',
    altPrefix: 'Open Bitcoin Tracker — ',
    altSuffix: '',
    reasons: [
      {
        title: 'Tam gizlilik',
        body: "OBT'nin ne seed'e ne de key'lere ihtiyacı var. Bitcoin miktarlarını elle girersin ve bu bilgiler asla telefonundan çıkmaz.",
      },
      {
        title: 'Hızlı ve hafif',
        body: "OBT hiçbir node'a bağlanmaz: anında açılır ve pili neredeyse hiç yormaz.",
      },
    ],
  },

  themes: {
    heading: 'Tarzınla hodla',
    sub: 'Sisteminin moduna otomatik uyan dört tema.',
    regionAria: 'Uygulama temaları',
    showAria: '{label} ekran görüntüsünü göster',
    altPrefix: 'Open Bitcoin Tracker — ',
    altSuffix: '',
    labels: ['Paper Cream', 'Salmon Press', 'Deepsea Blue', 'OLED Black'],
  },

  prices: {
    heading: 'Geçmiş ve gelecek fiyatlar',
    sub: 'Geçmiş trendleri analiz edin ve gelecekteki değeri tahmin edin.',
    cards: [
      { title: 'Geçmiş fiyat takibi', body: 'Geçmiş Bitcoin fiyat verilerini analiz edin.' },
      { title: 'Gelecek projeksiyon araçları', body: 'Hedef fiyatlara göre değer simülasyonu yapın.' },
    ],
  },

  privacy: {
    heading: 'Tam gizlilik',
    sub: 'Verilerin telefonunda kalır.',
    cards: [
      { title: 'Hesap yok', body: 'Kayıt yok. Uygulamayı kur ve takibe başla.' },
      { title: 'Takip yok', body: 'Sıfır analiz, reklam yok, parmak izi yok.' },
      { title: 'Yalnızca cihazda', body: "Stack'lerin telefonunda kalır. Hiçbir şey yüklenmez." },
      { title: 'Açık kaynak', body: 'MIT Lisansı. Güvenme, doğrula.' },
    ],
  },

  kao: {
    body: "Eylül 2026'dan itibaren Google, Play Store dışında kurulan uygulamalar için bile her Android geliştiricisinin kaydolmasını ve kimliğini doğrulamasını zorunlu kılacak. Bu, bunun gibi açık kaynaklı uygulamaları tehdit ediyor.",
    linkText: 'Daha fazla bilgi: keepandroidopen.org',
  },

  footer: {
    copyright: '© 2026 · MIT Lisansı',
    appHeader: 'Uygulama',
    projectHeader: 'Proje',
    about: 'Hakkında',
    privacy: 'Gizlilik Politikası',
    github: 'GitHub',
    reportBug: 'Hata bildir',
  },

  about: {
    h1: 'Hakkında',
    storyHeader: "OBT'yi neden yaptım",
    story: [
      "Open Bitcoin Tracker'ı, birden fazla stack'i rahatça takip etmek istediğim için yaptım. İşlem yapmaya ihtiyacım yok, sadece değerlerini izlemek istiyorum. Çoğu wallet ise yalnızca tek bir stack'e izin veriyor ya da bir node'a bağlanmak zorunda olduğu için yavaş kalıyor.",
      'Sonunda ailem ve arkadaşlarım da kullanmaya başladı, ben de başkalarının işine yarar diye herkese açtım.',
    ],
    dataSourcesHeader: 'Android uygulaması için veri kaynakları',
    note: 'Uygulamanın bu sağlayıcılarla hiçbir ilişkisi yoktur.',
    licenses: "GitHub'da MIT lisansı",
    madeBy: 'Max Hodler tarafından',
    forGrandma: 'Babaannem için 🌼',
    profileHeader: 'Max Hodler tarafından oluşturuldu',
    followAria: "X'te Max Hodler",
    primalAria: "Primal'da Max Hodler",
    dataSourceLabels: ['Güncel fiyatlar', 'Geçmiş fiyatlar', 'Geçmiş döviz kurları', 'Mempool ve hashrate'],
  },

  policy: {
    h1: 'Gizlilik Politikası',
    lastUpdated: 'Son güncelleme: 26 Mayıs 2026',
    intro:
      'Bu politika, Open Bitcoin Tracker Android uygulamasının («uygulama») hangi verileri işlediğini, sakladığını ve ilettiğini açıklar. Uygulama, MIT Lisansı altında açık kaynaklı yazılım olarak yayımlanmaktadır.',
    sections: [
      {
        heading: '1. Özet',
        paras: [
          'Uygulama kişisel veri toplamaz. Kullanıcı hesabı, analiz, reklam tanımlayıcısı ve telemetri yoktur. Uygulamaya girdiğiniz tüm veriler cihazınızda kalır.',
        ],
      },
      {
        heading: '2. Cihazınızda saklanan veriler',
        paras: [
          'Aşağıdaki bilgiler uygulamanın özel depolama alanında yerel olarak saklanır ve geliştirici tarafından işletilen herhangi bir sunucuya iletilmez:',
        ],
        list: [
          'Girdiğiniz stack adları ve Bitcoin bakiye miktarları.',
          'Uygulama tercihleri ve görüntüleme ayarları.',
          "Android Keystore'da tutulan isteğe bağlı PIN veya biyometrik kilit açma yapılandırması.",
        ],
        parasAfter: [
          "Bu uygulama için Android'in Google Drive'a otomatik yedeklemesi devre dışıdır, bu nedenle yerel olarak saklanan veriler bu mekanizmayla Google'ın sunucularına kopyalanmaz.",
        ],
      },
      {
        heading: '3. Ağ istekleri',
        paras: [
          'Piyasa verilerini ve zincir üstü bilgileri göstermek için uygulama aşağıdaki üçüncü taraf hizmetlerine istek gönderir. Bu isteklere hiçbir hesap tanımlayıcısı, cihaz tanımlayıcısı veya takip parametresi eklenmez.',
        ],
        list: [
          'Kraken — gerçek zamanlı BTC fiyat verisi (WebSocket).',
          'mempool.space — blok yüksekliği, medyan ücretler ve blok tahminleri.',
          "Coin Metrics — geçmiş ağ hashrate'i.",
          'Avrupa Merkez Bankası — günlük itibari para referans döviz kurları.',
        ],
        parasAfter: [
          'Bu sağlayıcılar, istekte bulunan cihazın IP adresini zorunlu olarak alır. Bu bilgileri işlemeleri kendi gizlilik politikalarına tabidir.',
        ],
      },
      {
        heading: '4. Toplanmayan veriler',
        paras: ['Uygulama aşağıdakilerden hiçbirini toplamaz, iletmez veya saklamaz:'],
        list: [
          'Kullanıcı hesapları, oturum açma kimlik bilgileri veya e-posta adresleri.',
          'Analiz veya ürün kullanım verileri (ör. Firebase Analytics, Sentry, Mixpanel).',
          "Reklam tanımlayıcıları veya reklam SDK'ları.",
          'Cihaz dışı çökme raporları.',
        ],
      },
      {
        heading: '5. İzinler',
        paras: ['Uygulama aşağıdaki Android izinlerini ister:'],
        list: [
          'İnternet — piyasa verilerini ve mempool bilgilerini almak için gereklidir.',
          "Biyometrik kimlik doğrulama (isteğe bağlı) — etkinleştirildiğinde, uygulama yerel olarak kilidi açmak için Android'in BiometricPrompt API'sini kullanır. Biyometrik veriler Android işletim sistemi tarafından yönetilir; uygulama bunları asla almaz veya saklamaz.",
        ],
        parasAfter: [
          'Uygulama kişilere, konuma, kameraya, mikrofona veya genel dosya depolamasına erişim istemez.',
        ],
      },
      {
        heading: '6. Kaynak kodu',
        paras: [
          'Uygulamanın eksiksiz kaynak kodu herkese açıktır ve MIT Lisansı koşulları altında bağımsız olarak denetlenebilir, derlenebilir veya değiştirilebilir.',
        ],
        repoLabel: 'Depo:',
      },
      {
        heading: '7. Çocuklar',
        paras: [
          'Uygulama çocuklara yönelik değildir. Kişisel veri toplamadığından, herhangi bir yaştaki çocukların kişisel verilerini bilerek işlemez.',
        ],
      },
      {
        heading: '8. Bu politikadaki değişiklikler',
        paras: [
          'Bu politika güncellenirse, gözden geçirilmiş sürüm bu sayfada yayımlanır ve yukarıdaki «Son güncelleme» tarihi değişikliğin tarihini yansıtacak şekilde değiştirilir. Veri işleme uygulamalarında önemli değişiklikler varsa burada belirtilir.',
        ],
      },
      {
        heading: '9. İletişim',
        contactBefore: 'Bu politikayla ilgili sorular, proje deposunda bir issue olarak gönderilebilir:',
        contactAfter: '.',
      },
    ],
  },
};
