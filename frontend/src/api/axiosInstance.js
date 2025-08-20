// frontend/src/api/axiosInstance.js
import axios from 'axios';

const api = axios.create({
  // baseURL not needed with your Vite proxy; leave blank
  withCredentials: false,
});

// Pull token from storage, normalize it (strip any leading "Bearer ")
function getStoredToken() {
  try {
    const keys = ['token', 'authToken', 'jwt'];
    for (const k of keys) {
      const v =
        (typeof localStorage !== 'undefined' && localStorage.getItem(k)) ||
        (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(k));
      if (v && v.trim()) return v.replace(/^Bearer\s+/i, '').trim();
    }
  } catch {}
  return null;
}

// Attach Authorization to EVERY request unless caller already set it
api.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};
  if (!('Authorization' in config.headers)) {
    const t = getStoredToken();
    if (t) config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});

// Optional: inspect 401s without auto-redirecting
api.interceptors.response.use(
  (res) => res,
  (err) => {
    // console.debug('API error', err?.response?.status, err?.response?.data);
    return Promise.reject(err);
  }
);

export default api;
