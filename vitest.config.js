// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'utils/__tests__/**/*.test.js',
      'routes/__tests__/**/*.test.js',
      'middleware/__tests__/**/*.test.js',
      'services/__tests__/**/*.test.js',
      'frontend/src/**/__tests__/**/*.test.js',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'frontend/**',
        'scripts/**',
        '*.config.js'
      ]
    },
    testTimeout: 10000,
  },
});
