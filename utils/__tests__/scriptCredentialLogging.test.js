import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  authenticationFailedDiagnostic,
  authenticationSucceededDiagnostic,
  mongoUriDiagnostic,
} from '../../scripts/safeDiagnostics.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const debugScript = fileURLToPath(new URL('../../scripts/debug_carry_forward.mjs', import.meta.url));
const loginScript = fileURLToPath(new URL('../../scripts/login_and_audit.mjs', import.meta.url));
const smokeNotesScript = fileURLToPath(new URL('../../scripts/smoke_notes_pages.mjs', import.meta.url));
const mongoUri = 'mongodb://SECRET_USER:SECRET_PASSWORD@example.invalid/private?replicaSet=SECRET_REPLICA';
const token = 'SECRET_TOKEN_SENTINEL';

function outputOf(result) {
  return `${result.stdout || ''}${result.stderr || ''}`;
}

describe('script credential-safe diagnostics', () => {
  it('never includes credential material in MongoDB or authentication diagnostics', () => {
    const output = [
      mongoUriDiagnostic(mongoUri),
      authenticationSucceededDiagnostic('/api/auth/login?token=SECRET_TOKEN_SENTINEL'),
      authenticationFailedDiagnostic({
        status: 401,
        path: '/api/auth/login?token=SECRET_TOKEN_SENTINEL',
        data: { token, password: 'SECRET_PASSWORD' },
      }),
    ].join('\n');

    expect(output).toContain('MongoDB URI configured: yes (host: example.invalid)');
    expect(output).toContain('Authentication succeeded via /api/auth/login');
    expect(output).toContain('Authentication failed via /api/auth/login (status: 401)');
    for (const secret of [mongoUri, 'SECRET_USER', 'SECRET_PASSWORD', 'SECRET_REPLICA', token]) {
      expect(output).not.toContain(secret);
    }
  });

  it('keeps the scripts safe on their non-destructive early-exit paths', () => {
    const debug = spawnSync(process.execPath, [debugScript], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, MONGODB_URI: mongoUri },
    });
    const login = spawnSync(process.execPath, [loginScript], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, EMAIL: '', PASSWORD: '', TOKEN: token },
    });

    expect(debug.status).toBe(1);
    expect(outputOf(debug)).toContain('Usage:');
    expect(login.status).toBe(2);
    expect(outputOf(login)).toContain('Set EMAIL and PASSWORD env vars to login.');
    for (const output of [outputOf(debug), outputOf(login)]) {
      for (const secret of [mongoUri, 'SECRET_USER', 'SECRET_PASSWORD', token]) {
        expect(output).not.toContain(secret);
      }
    }
  });

  it('uses safe diagnostic helpers instead of logging raw credentials or auth responses', () => {
    const debug = readFileSync(debugScript, 'utf8');
    const login = readFileSync(loginScript, 'utf8');
    const smokeNotes = readFileSync(smokeNotesScript, 'utf8');

    expect(debug).toContain('mongoUriDiagnostic(MONGO)');
    expect(debug).not.toContain("console.log('MONGO:', MONGO)");
    expect(debug).not.toContain('console.error(e)');
    expect(login).toContain('authenticationSucceededDiagnostic(login.path)');
    expect(login).not.toContain('TOKEN.slice');
    expect(login).not.toContain("console.error('Auth failed:', reg");
    expect(smokeNotes).not.toContain("console.error('Auth failed:', login)");
  });
});
