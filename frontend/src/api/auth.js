// /frontend/src/api/auth.js
import api from './axiosInstance';

// Login with whatever the user types (username or email)
export async function login(identifier, password) {
  const { data } = await api.post('/api/login', { identifier, password }); // server aliases /api/auth/*
  if (data?.token) {
    // normalize storage
    localStorage.setItem('token', data.token);
  }
  return data;
}

export async function register({ username, password, email }) {
  const { data } = await api.post('/api/register', { username, password, email });
  if (data?.token) localStorage.setItem('token', data.token);
  return data;
}

export async function forgot(identifier) {
  const { data } = await api.post('/api/forgot', { identifier });
  return data;
}

export async function resetWithToken(token, newPassword) {
  const { data } = await api.post('/api/reset', { token, newPassword });
  if (data?.token) localStorage.setItem('token', data.token);
  return data;
}

export async function resetWithCode(username, code, newPassword) {
  const { data } = await api.post('/api/reset', { username, code, newPassword });
  if (data?.token) localStorage.setItem('token', data.token);
  return data;
}

export async function me() {
  const { data } = await api.get('/api/me');
  return data;
}

export async function updateMe({ email, username }) {
  const { data } = await api.patch('/api/me', { email, username });
  return data;
}

export async function startVerifyEmail(email) {
  const { data } = await api.post('/api/email/start-verify', { email });
  return data;
}

export async function verifyEmail(code) {
  const { data } = await api.post('/api/email/verify', { code });
  return data;
}

export function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('authToken');
  localStorage.removeItem('jwt');
}
