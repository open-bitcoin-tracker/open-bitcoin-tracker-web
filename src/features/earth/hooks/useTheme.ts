import { useCallback, useEffect, useState } from 'react';
import { readSiteTheme, setSiteTheme, watchSiteTheme } from '../lib/siteTheme';
import type { Theme } from '../lib/theme';

export function useTheme() {
  const [theme, updateTheme] = useState<Theme>(readSiteTheme);
  useEffect(() => watchSiteTheme(updateTheme), []);
  const setTheme = useCallback((choice: Theme) => setSiteTheme(choice), []);
  return { setTheme, theme };
}
