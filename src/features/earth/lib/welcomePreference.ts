const WELCOME_KEY = 'obt-earth-welcome-hidden-v1';

export function shouldShowWelcome(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) !== 'true';
  } catch {
    return true;
  }
}

export function hideWelcomeOnFutureVisits(): void {
  try {
    localStorage.setItem(WELCOME_KEY, 'true');
  } catch {
    // Storage may be unavailable; dismissal must still reveal the map.
  }
}
