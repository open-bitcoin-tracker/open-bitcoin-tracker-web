export type Theme = 'light' | 'dark';
export const DARK_MODE_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(
  override: Theme | null,
  systemDark: boolean,
): Theme {
  return override ?? (systemDark ? 'dark' : 'light');
}

export function watchSystemTheme(
  onChange: (dark: boolean) => void,
  media = window.matchMedia(DARK_MODE_QUERY),
) {
  onChange(media.matches);
  const update = (event: MediaQueryListEvent) => onChange(event.matches);
  media.addEventListener('change', update);
  return () => media.removeEventListener('change', update);
}
