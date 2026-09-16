import { describe, expect, it } from 'vitest';
import { assertRuntimeConfig, runtimeConfigErrors } from '../runtimeConfig.js';

const validProduction = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb://database.internal:27017/stream',
  JWT_SECRET: 'a-secure-signing-secret-that-is-longer-than-32-characters',
  CLIENT_ORIGIN: 'https://stream.example.test',
  PRIVATE_UPLOAD_DIR: '/var/lib/streamofconshushness/private-uploads',
  EXPOSE_AUTH_TEST_CREDENTIALS: 'false',
};

describe('production runtime configuration', () => {
  it('accepts a complete production configuration', () => {
    expect(runtimeConfigErrors(validProduction)).toEqual([]);
    expect(() => assertRuntimeConfig(validProduction)).not.toThrow();
  });

  it('fails closed for missing private-data dependencies without exposing their values', () => {
    const errors = runtimeConfigErrors({
      NODE_ENV: 'production',
      MONGODB_URI: 'not-a-database-url',
      JWT_SECRET: 'short-secret',
      CLIENT_ORIGIN: '*',
      PRIVATE_UPLOAD_DIR: 'relative/uploads',
      EXPOSE_AUTH_TEST_CREDENTIALS: 'true',
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('MONGODB_URI'),
      expect.stringContaining('JWT_SECRET'),
      expect.stringContaining('CLIENT_ORIGIN'),
      expect.stringContaining('PRIVATE_UPLOAD_DIR'),
      expect.stringContaining('EXPOSE_AUTH_TEST_CREDENTIALS'),
    ]));
    expect(JSON.stringify(errors)).not.toContain('short-secret');
  });

  it('requires complete mail settings and a safe reset-link base URL', () => {
    const errors = runtimeConfigErrors({
      ...validProduction,
      SMTP_HOST: 'smtp.example.test',
      SMTP_USER: '',
      SMTP_PASS: 'hidden',
      APP_BASE_URL: '',
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('SMTP_HOST, SMTP_USER, and SMTP_PASS'),
      expect.stringContaining('APP_BASE_URL'),
    ]));
    expect(JSON.stringify(errors)).not.toContain('hidden');
  });

  it('rejects invalid ports, proxy topology, broad filesystem roots, and debug flags', () => {
    const errors = runtimeConfigErrors({
      ...validProduction,
      PORT: '70000',
      TRUST_PROXY_HOPS: 'all',
      SMTP_HOST: 'smtp.example.test',
      SMTP_USER: 'mailer',
      SMTP_PASS: 'secret',
      SMTP_PORT: 'not-a-port',
      APP_BASE_URL: 'https://stream.example.test',
      PRIVATE_UPLOAD_DIR: '/',
      EXPOSE_ROUTE_INSPECTOR: 'true',
    });

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('PORT'),
      expect.stringContaining('TRUST_PROXY_HOPS'),
      expect.stringContaining('SMTP_PORT'),
      expect.stringContaining('PRIVATE_UPLOAD_DIR'),
      expect.stringContaining('EXPOSE_ROUTE_INSPECTOR'),
    ]));
  });

  it('requires CLIENT_ORIGIN to match the browser Origin header exactly', () => {
    expect(runtimeConfigErrors({
      ...validProduction,
      CLIENT_ORIGIN: 'https://stream.example.test/app',
    })).toContain('CLIENT_ORIGIN must be an exact HTTP(S) origin without a path');
    expect(runtimeConfigErrors({
      ...validProduction,
      CLIENT_ORIGIN: 'https://user:pass@stream.example.test',
    })).toContain('CLIENT_ORIGIN must be an exact HTTP(S) origin without a path');
  });

  it('keeps development and test setup flexible while rejecting unknown modes', () => {
    expect(runtimeConfigErrors({ NODE_ENV: 'development' })).toEqual([]);
    expect(runtimeConfigErrors({ NODE_ENV: 'test' })).toEqual([]);
    expect(runtimeConfigErrors({ NODE_ENV: 'staging' })).toEqual([
      'NODE_ENV must be development, test, or production',
    ]);
  });
});
