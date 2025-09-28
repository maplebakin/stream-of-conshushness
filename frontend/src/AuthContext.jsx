/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import { setAuthToken as setApiToken } from './api/axiosInstance.js';

export const AuthContext = createContext(null);

const TOKEN_KEY = 'auth_token';
const LEGACY_TOKEN_KEY = 'token'; // migrate from the old key
const EXPIRY_BUFFER_MS = 30_000;

function decodeUser(token) {
  try {
    const decoded = jwtDecode(token);
    if (!decoded || typeof decoded !== 'object') return null;
    const expMs = typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
    if (expMs && expMs <= Date.now() + EXPIRY_BUFFER_MS) {
      return null;
    }
    return decoded;
  } catch (error) {
    console.warn('[AuthContext] Failed to decode token', error);
    return null;
  }
}

function loadInitialState() {
  try {
    const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
    const current = localStorage.getItem(TOKEN_KEY);
    // prefer the new key; migrate legacy if found
    const token = current || legacy || '';

    if (legacy && !current) {
      localStorage.setItem(TOKEN_KEY, legacy);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }

    if (!token) {
      if (legacy) localStorage.removeItem(LEGACY_TOKEN_KEY);
      return { token: '', user: null };
    }

    const decoded = decodeUser(token);
    if (!decoded) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('auth_user');
      if (legacy) localStorage.removeItem(LEGACY_TOKEN_KEY);
      return { token: '', user: null };
    }

    let storedUser = null;
    try {
      const raw = localStorage.getItem('auth_user');
      storedUser = raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('[AuthContext] Could not parse stored auth_user', error);
      storedUser = null;
    }

    const user = storedUser ? { ...decoded, ...storedUser } : decoded;
    return { token, user };
  } catch (error) {
    console.warn('[AuthContext] Failed to load initial auth state', error);
    return { token: '', user: null };
  }
}

export function AuthProvider({ children }) {
  const initialRef = useRef(null);
  if (initialRef.current === null) {
    initialRef.current = loadInitialState();
  }

  const [token, setToken] = useState(() => initialRef.current.token);
  const [user, setUser] = useState(() => initialRef.current.user);
  const logoutTimerRef = useRef(null);

  const logout = useCallback(() => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    setToken('');
    setUser(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('auth_user');
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch (error) {
      console.warn('[AuthContext] Failed to clear storage on logout', error);
    }
  }, []);

  // Accepts either a string token OR an object { token, user }
  const login = useCallback((input) => {
    const t = typeof input === 'string' ? input : (input?.token || '');
    const u = typeof input === 'string' ? null  : (input?.user  || null);
    if (t) {
      const decoded = decodeUser(t);
      if (!decoded) {
        logout();
        return;
      }
      const mergedUser = u ? { ...decoded, ...u } : decoded;
      setToken(t);
      setUser(mergedUser);
      try {
        localStorage.setItem(TOKEN_KEY, t);
        localStorage.setItem('auth_user', JSON.stringify(mergedUser));
        localStorage.removeItem(LEGACY_TOKEN_KEY);
      } catch (error) {
        console.warn('[AuthContext] Failed to persist token during login', error);
      }
    } else {
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
      setToken('');
      setUser(null);
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('auth_user');
        localStorage.removeItem(LEGACY_TOKEN_KEY);
      } catch (error) {
        console.warn('[AuthContext] Failed to clear storage during login fallback', error);
      }
    }
  }, [logout]);

  // Keep axios default Authorization in sync + persist token
  useEffect(() => {
    const normalizedUser = user === null ? null : user || undefined;
    setApiToken(token || '', normalizedUser);
  }, [token, user]);

  // Auto-logout on 401 broadcast from axios
  useEffect(() => {
    function onUnauthorized() {
      logout();
    }
    window.addEventListener('auth:unauthorized', onUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized);
  }, [logout]);

  useEffect(() => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }

    if (!token) {
      setUser(null);
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('auth_user');
      } catch (error) {
        console.warn('[AuthContext] Failed to clear storage when token missing', error);
      }
      return;
    }

    const decoded = decodeUser(token);
    if (!decoded) {
      logout();
      return;
    }

    setUser((prev) => {
      if (!prev) return decoded;
      return { ...prev, ...decoded };
    });

    const expMs = typeof decoded.exp === 'number' ? decoded.exp * 1000 : null;
    if (expMs) {
      const delay = Math.max(0, expMs - Date.now() - EXPIRY_BUFFER_MS);
      logoutTimerRef.current = window.setTimeout(() => {
        logout();
      }, delay);
    }

    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (error) {
      console.warn('[AuthContext] Failed to persist token update', error);
    }
  }, [token, logout]);

  const value = useMemo(() => ({
    token: token || null,
    user,
    login,
    logout,
    isAuthenticated: !!token && !!user,
  }), [token, user, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Optional convenience hook
export function useAuth() {
  return useContext(AuthContext);
}
