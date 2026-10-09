import type { Lang } from './ui';

const en = {
  title: 'Open Bitcoin Tracker',
  description: 'The live Bitcoin price in USD and its full price history since 2010. Explore Bitcoin tools from Open Bitcoin Tracker.',
  price: 'Bitcoin price', all: 'All time', scale: 'Logarithmic scale', linearScale: 'Linear scale', logScaleShort: 'Log', linearScaleShort: 'Lin',
  live: 'Live', connecting: 'Connecting', delayed: 'Reconnecting', offline: 'Offline',
  updated: 'Last updated', unavailable: 'Live price unavailable', history: 'Recent history unavailable',
  chart: 'Bitcoin price history in USD on a logarithmic scale, since July 2010',
  priceChart: 'Price Chart', app: 'Android app', about: 'About', privacy: 'Privacy',
};

export type TrackerCopy = { [K in keyof typeof en]: string };

export const tracker: Record<Lang, TrackerCopy> = {
  en,
  es: {
    title: 'Open Bitcoin Tracker', description: 'El precio de Bitcoin en directo en USD y su historial completo desde 2010.',
    price: 'Precio de Bitcoin', all: 'Todo el historial', scale: 'Escala logarítmica', linearScale: 'Escala lineal', logScaleShort: 'Log', linearScaleShort: 'Lin', live: 'En directo', connecting: 'Conectando', delayed: 'Reconectando', offline: 'Sin conexión',
    updated: 'Última actualización', unavailable: 'Precio en directo no disponible', history: 'Historial reciente no disponible', chart: 'Historial del precio de Bitcoin en USD en escala logarítmica, desde julio de 2010',
    priceChart: 'Gráfico de precio', app: 'App Android', about: 'Acerca de', privacy: 'Privacidad',
  },
  'pt-BR': {
    title: 'Open Bitcoin Tracker', description: 'O preço do Bitcoin ao vivo em USD e seu histórico completo desde 2010.',
    price: 'Preço do Bitcoin', all: 'Todo o histórico', scale: 'Escala logarítmica', linearScale: 'Escala linear', logScaleShort: 'Log', linearScaleShort: 'Lin', live: 'Ao vivo', connecting: 'Conectando', delayed: 'Reconectando', offline: 'Sem conexão',
    updated: 'Última atualização', unavailable: 'Preço ao vivo indisponível', history: 'Histórico recente indisponível', chart: 'Histórico do preço do Bitcoin em USD em escala logarítmica, desde julho de 2010',
    priceChart: 'Gráfico de preço', app: 'App Android', about: 'Sobre', privacy: 'Privacidade',
  },
  fr: {
    title: 'Open Bitcoin Tracker', description: 'Le cours du Bitcoin en direct en USD et son historique complet depuis 2010.',
    price: 'Cours du Bitcoin', all: 'Tout l’historique', scale: 'Échelle logarithmique', linearScale: 'Échelle linéaire', logScaleShort: 'Log', linearScaleShort: 'Lin', live: 'En direct', connecting: 'Connexion', delayed: 'Reconnexion', offline: 'Hors ligne',
    updated: 'Dernière mise à jour', unavailable: 'Cours en direct indisponible', history: 'Historique récent indisponible', chart: 'Historique du cours du Bitcoin en USD sur une échelle logarithmique, depuis juillet 2010',
    priceChart: 'Graphique du prix', app: 'Appli Android', about: 'À propos', privacy: 'Confidentialité',
  },
  de: {
    title: 'Open Bitcoin Tracker', description: 'Der Live-Bitcoin-Kurs in USD und die vollständige Kurshistorie seit 2010.',
    price: 'Bitcoin-Kurs', all: 'Gesamter Zeitraum', scale: 'Logarithmische Skala', linearScale: 'Lineare Skala', logScaleShort: 'Log', linearScaleShort: 'Lin', live: 'Live', connecting: 'Verbindung wird hergestellt', delayed: 'Verbindung wird wiederhergestellt', offline: 'Offline',
    updated: 'Zuletzt aktualisiert', unavailable: 'Live-Kurs nicht verfügbar', history: 'Aktuelle Kurshistorie nicht verfügbar', chart: 'Bitcoin-Kurshistorie in USD auf einer logarithmischen Skala seit Juli 2010',
    priceChart: 'Kurschart', app: 'Android-App', about: 'Über uns', privacy: 'Datenschutz',
  },
  it: {
    title: 'Open Bitcoin Tracker', description: 'Il prezzo di Bitcoin in tempo reale in USD e lo storico completo dal 2010.',
    price: 'Prezzo di Bitcoin', all: 'Tutto lo storico', scale: 'Scala logaritmica', linearScale: 'Scala lineare', logScaleShort: 'Log', linearScaleShort: 'Lin', live: 'In diretta', connecting: 'Connessione', delayed: 'Riconnessione', offline: 'Offline',
    updated: 'Ultimo aggiornamento', unavailable: 'Prezzo in tempo reale non disponibile', history: 'Storico recente non disponibile', chart: 'Storico del prezzo di Bitcoin in USD su scala logaritmica, da luglio 2010',
    priceChart: 'Grafico del prezzo', app: 'App Android', about: 'Informazioni', privacy: 'Privacy',
  },
  ru: {
    title: 'Open Bitcoin Tracker', description: 'Курс биткоина в реальном времени в USD и полная история с 2010 года.',
    price: 'Курс биткоина', all: 'За всё время', scale: 'Логарифмическая шкала', linearScale: 'Линейная шкала', logScaleShort: 'Лог', linearScaleShort: 'Лин', live: 'В реальном времени', connecting: 'Подключение', delayed: 'Переподключение', offline: 'Нет сети',
    updated: 'Последнее обновление', unavailable: 'Текущий курс недоступен', history: 'Недавняя история недоступна', chart: 'История курса биткоина в USD на логарифмической шкале с июля 2010 года',
    priceChart: 'График цены', app: 'Приложение Android', about: 'О проекте', privacy: 'Конфиденциальность',
  },
  tr: {
    title: 'Open Bitcoin Tracker', description: 'USD cinsinden canlı Bitcoin fiyatı ve 2010’dan bu yana tüm fiyat geçmişi.',
    price: 'Bitcoin fiyatı', all: 'Tüm zamanlar', scale: 'Logaritmik ölçek', linearScale: 'Doğrusal ölçek', logScaleShort: 'Log', linearScaleShort: 'Lin', live: 'Canlı', connecting: 'Bağlanıyor', delayed: 'Yeniden bağlanıyor', offline: 'Çevrimdışı',
    updated: 'Son güncelleme', unavailable: 'Canlı fiyat kullanılamıyor', history: 'Yakın tarihli veriler kullanılamıyor', chart: 'Temmuz 2010’dan bu yana logaritmik ölçekte USD cinsinden Bitcoin fiyat geçmişi',
    priceChart: 'Fiyat grafiği', app: 'Android uygulaması', about: 'Hakkında', privacy: 'Gizlilik',
  },
  vi: {
    title: 'Open Bitcoin Tracker', description: 'Giá Bitcoin trực tiếp bằng USD và toàn bộ lịch sử giá từ năm 2010.',
    price: 'Giá Bitcoin', all: 'Toàn bộ', scale: 'Thang logarit', linearScale: 'Thang tuyến tính', logScaleShort: 'Log', linearScaleShort: 'Lin', live: 'Trực tiếp', connecting: 'Đang kết nối', delayed: 'Đang kết nối lại', offline: 'Ngoại tuyến',
    updated: 'Cập nhật lần cuối', unavailable: 'Giá trực tiếp không khả dụng', history: 'Lịch sử gần đây không khả dụng', chart: 'Lịch sử giá Bitcoin bằng USD trên thang logarit từ tháng 7 năm 2010',
    priceChart: 'Biểu đồ giá', app: 'Ứng dụng Android', about: 'Giới thiệu', privacy: 'Quyền riêng tư',
  },
  ja: {
    title: 'Open Bitcoin Tracker', description: 'ビットコインのリアルタイム価格（USD）と2010年からの全価格履歴。',
    price: 'ビットコイン価格', all: '全期間', scale: '対数スケール', linearScale: '線形スケール', logScaleShort: '対数', linearScaleShort: '線形', live: 'ライブ', connecting: '接続中', delayed: '再接続中', offline: 'オフライン',
    updated: '最終更新', unavailable: 'リアルタイム価格を取得できません', history: '最近の履歴を取得できません', chart: '2010年7月からのビットコイン価格履歴（USD、対数スケール）',
    priceChart: '価格チャート', app: 'Androidアプリ', about: '概要', privacy: 'プライバシー',
  },
};
