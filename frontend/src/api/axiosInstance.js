import axios from 'axios';


const api = axios.create({ withCredentials: false });


function getStoredToken() {
try {
const keys = ['token', 'authToken', 'jwt'];
for (const k of keys) {
const v = (typeof localStorage !== 'undefined' && localStorage.getItem(k))
|| (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(k));
if (v && v.trim()) return v.replace(/^Bearer\s+/i, '').trim();
}
} catch {}
return null;
}


api.interceptors.request.use((config) => {
config.headers = config.headers ?? {};
if (!('Authorization' in config.headers)) {
const t = getStoredToken();
if (t) config.headers.Authorization = `Bearer ${t}`;
}
return config;
});


export default api;