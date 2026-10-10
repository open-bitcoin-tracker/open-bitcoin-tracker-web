import type { Theme } from './theme';

export function readSiteTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function setSiteTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try { localStorage.setItem('theme', theme); } catch { /* Keep the choice usable without storage. */ }
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = theme === 'dark' ? '#0F1E3A' : '#F8F7F3';
  document.head.append(meta);
  document.dispatchEvent(new CustomEvent('themechange', { detail: { dark: theme === 'dark' } }));
}

export function watchSiteTheme(onChange: (theme: Theme) => void) {
  const update = () => onChange(readSiteTheme());
  document.addEventListener('themechange', update);
  // Also follows any future class-based theme initialization or system update.
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  update();
  return () => {
    document.removeEventListener('themechange', update);
    observer.disconnect();
  };
}
