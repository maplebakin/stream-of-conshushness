// frontend/src/utils/api.js
export function makeApi(token) {
  async function base(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const msg = data?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }
  return {
    get: (url) => base('GET', url),
    post: (url, body) => base('POST', url, body),
    put: (url, body) => base('PUT', url, body),
    del: (url) => base('DELETE', url),
  };
}
