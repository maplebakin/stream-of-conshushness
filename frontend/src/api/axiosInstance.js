import axios from 'axios';

// ---------------- URL NORMALIZER ----------------
// Guarantees exactly one "/api/" for relative paths.
// Leaves absolute URLs ("http://", "https://") untouched.
function normalizeUrl(input) {
  const url = String(input || '').trim();

  // absolute URLs: do nothing
  if (/^https?:\/\//i.test(url)) return url;

  // strip leading slashes
  let u = url.replace(/^\/+/, '');

  // strip ONE leading "api/" if present (handles "api/foo" and "/api/foo")
  if (u.toLowerCase().startsWith('api/')) u = u.slice(4);

  // join back
  return '/api/' + u;
}

// ---------------- TOKEN STORE ----------------
const TOKEN_KEY = 'auth_token';
const USER_KEY  = 'auth_user';

// read token/user from localStorage (if present)
function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch (error) {
    console.warn('[axiosInstance] Failed to read token from storage', error);
    return '';
  }
}
function writeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (error) {
    console.warn('[axiosInstance] Failed to persist token', error);
  }
}
function writeUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch (error) {
    console.warn('[axiosInstance] Failed to persist user payload', error);
  }
}

export function getToken() { return readToken(); }

// Set/clear the token on the default client
export function setToken(token, user) {
  writeToken(token || '');
  if (user !== undefined) writeUser(user || null);
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

// Backwards-compat alias (if you already imported setAuthToken elsewhere)
export const setAuthToken = setToken;

// ---------------- CLIENT ----------------
function makeClient(headers = {}) {
  const client = axios.create({
    baseURL: '',            // we rewrite config.url instead
    timeout: 15000,
    withCredentials: false, // align with CORS credentials: false on the server
    headers,
  });

  // Attach /api prefix AND Authorization on every request
  client.interceptors.request.use((config) => {
    config.url = normalizeUrl(config.url || '');

    // If no explicit Authorization on this request, use stored token
    if (!config.headers?.Authorization) {
      const t = readToken();
      if (t) {
        config.headers = { ...(config.headers || {}), Authorization: `Bearer ${t}` };
      }
    }

    return config;
  });

  // Auto-capture tokens from login responses; clear on 401
  client.interceptors.response.use(
    (res) => {
      const maybeToken = res?.data?.token;
      const maybeUser  = res?.data?.user;
      if (typeof maybeToken === 'string' && maybeToken.length > 10) {
        setToken(maybeToken, maybeUser);
      }
      return res;
    },
    (err) => {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || '';
      if (status === 401) {
        // If backend says token missing/invalid, wipe and broadcast
        if (/missing token|invalid token|expired/i.test(msg)) {
          setToken('', null);
        }
        try {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        } catch (error) {
          console.warn('[axiosInstance] Failed to dispatch auth:unauthorized event', error);
        }
      }
      return Promise.reject(err);
    }
  );

  return client;
}

const api = makeClient();

// If you ever need a one-off client with a specific token:
export function withAuth(token) {
  const hdrs = token ? { Authorization: `Bearer ${token}` } : {};
  return makeClient(hdrs);
}

export default api;
