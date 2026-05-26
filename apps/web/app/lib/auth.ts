export type AuthSession = {
  token: string;
  displayName: string;
};

const AUTH_TOKEN_KEY = "ollive.auth.token";
const AUTH_DISPLAY_NAME_KEY = "ollive.auth.display_name";

function readStorage(key: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

export function getStoredAuthToken() {
  return readStorage(AUTH_TOKEN_KEY);
}

export function getStoredAuthSession(): AuthSession | null {
  const token = readStorage(AUTH_TOKEN_KEY);
  if (!token) return null;
  return {
    token,
    displayName: readStorage(AUTH_DISPLAY_NAME_KEY) || "Guest",
  };
}

export function setStoredAuthSession(session: AuthSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_TOKEN_KEY, session.token);
  window.localStorage.setItem(AUTH_DISPLAY_NAME_KEY, session.displayName || "Guest");
}

export function clearStoredAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_DISPLAY_NAME_KEY);
}
