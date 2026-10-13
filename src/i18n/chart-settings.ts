import type { Lang } from './ui';

const en = {
  settings: 'Chart settings', scale: 'Scale', currency: 'Currency', logarithmic: 'Logarithmic', linear: 'Linear', fxLoading: 'Loading exchange rates…',
  fxUnavailable: 'Exchange rates unavailable.', fxHistoryUnavailable: 'Exchange-rate history unavailable.',
};
export type ChartSettingsCopy = { [K in keyof typeof en]: string };
export const chartSettings: Record<Lang, ChartSettingsCopy> = {
  en,
  es: { settings: 'Ajustes del gráfico', scale: 'Escala', currency: 'Moneda', logarithmic: 'Logarítmica', linear: 'Lineal', fxLoading: 'Cargando tipos de cambio…', fxUnavailable: 'Tipos de cambio no disponibles.', fxHistoryUnavailable: 'Historial de tipos de cambio no disponible.' },
  'pt-BR': { settings: 'Configurações do gráfico', scale: 'Escala', currency: 'Moeda', logarithmic: 'Logarítmica', linear: 'Linear', fxLoading: 'Carregando taxas de câmbio…', fxUnavailable: 'Taxas de câmbio indisponíveis.', fxHistoryUnavailable: 'Histórico de taxas de câmbio indisponível.' },
  fr: { settings: 'Réglages du graphique', scale: 'Échelle', currency: 'Devise', logarithmic: 'Logarithmique', linear: 'Linéaire', fxLoading: 'Chargement des taux de change…', fxUnavailable: 'Taux de change indisponibles.', fxHistoryUnavailable: 'Historique des taux de change indisponible.' },
  de: { settings: 'Charteinstellungen', scale: 'Skala', currency: 'Währung', logarithmic: 'Logarithmisch', linear: 'Linear', fxLoading: 'Wechselkurse werden geladen…', fxUnavailable: 'Wechselkurse nicht verfügbar.', fxHistoryUnavailable: 'Wechselkurshistorie nicht verfügbar.' },
  it: { settings: 'Impostazioni del grafico', scale: 'Scala', currency: 'Valuta', logarithmic: 'Logaritmica', linear: 'Lineare', fxLoading: 'Caricamento dei tassi di cambio…', fxUnavailable: 'Tassi di cambio non disponibili.', fxHistoryUnavailable: 'Storico dei tassi di cambio non disponibile.' },
  ru: { settings: 'Настройки графика', scale: 'Шкала', currency: 'Валюта', logarithmic: 'Логарифмическая', linear: 'Линейная', fxLoading: 'Загрузка курсов валют…', fxUnavailable: 'Курсы валют недоступны.', fxHistoryUnavailable: 'История курсов валют недоступна.' },
  tr: { settings: 'Grafik ayarları', scale: 'Ölçek', currency: 'Para birimi', logarithmic: 'Logaritmik', linear: 'Doğrusal', fxLoading: 'Döviz kurları yükleniyor…', fxUnavailable: 'Döviz kurları kullanılamıyor.', fxHistoryUnavailable: 'Döviz kuru geçmişi kullanılamıyor.' },
  vi: { settings: 'Cài đặt biểu đồ', scale: 'Thang đo', currency: 'Tiền tệ', logarithmic: 'Logarit', linear: 'Tuyến tính', fxLoading: 'Đang tải tỷ giá…', fxUnavailable: 'Tỷ giá không khả dụng.', fxHistoryUnavailable: 'Lịch sử tỷ giá không khả dụng.' },
  ja: { settings: 'チャート設定', scale: 'スケール', currency: '通貨', logarithmic: '対数', linear: '線形', fxLoading: '為替レートを読み込み中…', fxUnavailable: '為替レートを取得できません。', fxHistoryUnavailable: '為替レートの履歴を取得できません。' },
};
