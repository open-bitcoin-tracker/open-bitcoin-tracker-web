import { useEffect, useState } from 'react';
import { readSiteTheme, watchSiteTheme } from '../lib/siteTheme';
import type { Theme } from '../lib/theme';

export function useTheme() {
  const [theme, updateTheme] = useState<Theme>(readSiteTheme);
  useEffect(() => watchSiteTheme(updateTheme), []);
  return theme;
}
