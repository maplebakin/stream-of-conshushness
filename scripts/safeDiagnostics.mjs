function safeRoute(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) return null;
  return path.split('?')[0];
}

export function mongoUriDiagnostic(uri) {
  if (!uri) return 'MongoDB URI configured: no';

  try {
    const host = new URL(uri).hostname;
    return host ? `MongoDB URI configured: yes (host: ${host})` : 'MongoDB URI configured: yes';
  } catch {
    return 'MongoDB URI configured: yes';
  }
}

export function authenticationSucceededDiagnostic(path) {
  const route = safeRoute(path);
  return route ? `Authentication succeeded via ${route}` : 'Authentication succeeded';
}

export function authenticationFailedDiagnostic(result) {
  const status = Number.isInteger(result?.status) ? result.status : 'unknown';
  const route = safeRoute(result?.path);
  return route ? `Authentication failed via ${route} (status: ${status})` : `Authentication failed (status: ${status})`;
}
