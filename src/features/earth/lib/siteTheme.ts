export type Theme = 'light' | 'dark';

export function readSiteTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
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
