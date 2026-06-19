export type AuthSession = {
  token: string;
  displayName: string;
};

export const AUTH_BYPASS = process.env.NEXT_PUBLIC_AUTH_BYPASS === "true";
export const DEV_AUTH_TOKEN = "dev-bypass";

const AUTH_TOKEN_KEY = "ollive.auth.token";
const AUTH_DISPLAY_NAME_KEY = "ollive.auth.display_name";

function readStorage(key: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key);
}

export function getStoredAuthToken() {
  if (AUTH_BYPASS) return DEV_AUTH_TOKEN;
  return readStorage(AUTH_TOKEN_KEY);
}

export function getStoredAuthSession(): AuthSession | null {
  if (AUTH_BYPASS) {
    return {
      token: DEV_AUTH_TOKEN,
      displayName: "Dev",
    };
  }
  const token = readStorage(AUTH_TOKEN_KEY);
  if (!token) return null;
  return {
    token,
    displayName: readStorage(AUTH_DISPLAY_NAME_KEY) || "Guest",
  };
}

export function setStoredAuthSession(session: AuthSession) {
  if (AUTH_BYPASS) return;
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_TOKEN_KEY, session.token);
  window.localStorage.setItem(AUTH_DISPLAY_NAME_KEY, session.displayName || "Guest");
}

export function clearStoredAuthSession() {
  if (AUTH_BYPASS) return;
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AUTH_DISPLAY_NAME_KEY);
}
