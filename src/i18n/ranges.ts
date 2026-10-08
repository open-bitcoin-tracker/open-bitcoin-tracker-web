import type { Lang } from './ui';
import type { RangeUnit } from '../lib/bitcoin-range';

export interface RangeCopy {
  all: string;
  label: string;
  increase: string;
  decrease: string;
  loading: string;
  unavailable: string;
  suffixes: Record<RangeUnit, string>;
}

// Short labels follow the Android app's localized range pills.
export const ranges: Record<Lang, RangeCopy> = {
  en: { all: 'All', label: 'Time range', increase: 'Increase range', decrease: 'Decrease range', loading: 'Loading price history…', unavailable: 'Price history for this range is unavailable', suffixes: { day: 'D', week: 'W', month: 'M', year: 'Y' } },
  es: { all: 'Todo', label: 'Intervalo de tiempo', increase: 'Aumentar intervalo', decrease: 'Reducir intervalo', loading: 'Cargando historial de precios…', unavailable: 'El historial de este intervalo no está disponible', suffixes: { day: 'D', week: 'S', month: 'M', year: 'A' } },
  'pt-BR': { all: 'Tudo', label: 'Período', increase: 'Aumentar período', decrease: 'Diminuir período', loading: 'Carregando histórico de preços…', unavailable: 'O histórico deste período está indisponível', suffixes: { day: 'D', week: 'S', month: 'M', year: 'A' } },
  fr: { all: 'Tout', label: 'Période', increase: 'Augmenter la période', decrease: 'Réduire la période', loading: 'Chargement de l’historique des cours…', unavailable: 'L’historique de cette période est indisponible', suffixes: { day: 'J', week: 'S', month: 'M', year: 'A' } },
  de: { all: 'Alle', label: 'Zeitraum', increase: 'Zeitraum vergrößern', decrease: 'Zeitraum verkleinern', loading: 'Kursverlauf wird geladen…', unavailable: 'Der Kursverlauf für diesen Zeitraum ist nicht verfügbar', suffixes: { day: 'T', week: 'W', month: 'M', year: 'J' } },
  it: { all: 'Tutto', label: 'Intervallo di tempo', increase: 'Aumenta intervallo', decrease: 'Riduci intervallo', loading: 'Caricamento dello storico dei prezzi…', unavailable: 'Lo storico per questo intervallo non è disponibile', suffixes: { day: 'G', week: 'S', month: 'M', year: 'A' } },
  ru: { all: 'Всё', label: 'Период', increase: 'Увеличить период', decrease: 'Уменьшить период', loading: 'Загрузка истории курса…', unavailable: 'История курса за этот период недоступна', suffixes: { day: 'Д', week: 'Н', month: 'М', year: 'Г' } },
  tr: { all: 'Tümü', label: 'Zaman aralığı', increase: 'Aralığı artır', decrease: 'Aralığı azalt', loading: 'Fiyat geçmişi yükleniyor…', unavailable: 'Bu aralık için fiyat geçmişi kullanılamıyor', suffixes: { day: 'G', week: 'H', month: 'A', year: 'Y' } },
  vi: { all: 'Tất cả', label: 'Khoảng thời gian', increase: 'Tăng khoảng thời gian', decrease: 'Giảm khoảng thời gian', loading: 'Đang tải lịch sử giá…', unavailable: 'Lịch sử giá cho khoảng thời gian này không khả dụng', suffixes: { day: 'D', week: 'W', month: 'M', year: 'Y' } },
  ja: { all: '全期間', label: '期間', increase: '期間を増やす', decrease: '期間を減らす', loading: '価格履歴を読み込み中…', unavailable: 'この期間の価格履歴を取得できません', suffixes: { day: 'D', week: 'W', month: 'M', year: 'Y' } },
};
