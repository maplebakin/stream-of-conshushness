import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import api, { setAuthToken as setApiToken, getToken as getApiToken } from './api/axiosInstance.js';

export const AuthContext = createContext(null);

const TOKEN_KEY = 'auth_token';
const LEGACY_TOKEN_KEY = 'token'; // migrate from the old key

function decodeUser(token) {
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
}

function loadInitialToken() {
  try {
    const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
    const current = localStorage.getItem(TOKEN_KEY);
    // prefer the new key; migrate legacy if found
    const t = current || legacy || '';
    if (legacy && !current) {
      localStorage.setItem(TOKEN_KEY, legacy);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
    return t;
  } catch {
    return '';
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => loadInitialToken());
  const [user, setUser]   = useState(() => (token ? decodeUser(token) : null));

  // Keep axios default Authorization in sync + persist token
  useEffect(() => {
    setApiToken(token || '', user || undefined);
  }, [token, user]);

  // Auto-logout on 401 broadcast from axios
  useEffect(() => {
    function onUnauthorized() {
      setToken('');
      setUser(null);
    }
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, []);

  // Accepts either a string token OR an object { token, user }
  const login = useCallback((input) => {
    const t = typeof input === 'string' ? input : (input?.token || '');
    const u = typeof input === 'string' ? null  : (input?.user  || null);
    if (t) {
      setToken(t);
      setUser(u || decodeUser(t));
      try { localStorage.setItem(TOKEN_KEY, t); } catch {}
      try {
        if (u) localStorage.setItem('auth_user', JSON.stringify(u));
        else localStorage.removeItem('auth_user');
      } catch {}
    } else {
      setToken('');
      setUser(null);
      try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('auth_user'); } catch {}
    }
  }, []);

  const logout = useCallback(() => {
    login(''); // centralize clearing
  }, [login]);

  const value = useMemo(() => ({
    token: token || null,
    user,
    login,
    logout,
    isAuthenticated: !!token,
  }), [token, user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Optional convenience hook
export function useAuth() {
  return useContext(AuthContext);
}
