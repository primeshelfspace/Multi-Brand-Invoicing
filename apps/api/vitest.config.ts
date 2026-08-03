import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // This local Neon compute cannot reliably establish many concurrent new
    // connections at once (see DATABASE_URL's connection_limit=3 in .env) —
    // running test files in parallel multiplies that across workers and
    // starves every one of them out with transaction-acquisition timeouts.
    // One file at a time keeps total concurrent connections low; it costs
    // wall-clock time, not correctness.
    fileParallelism: false,
    // Even a single fresh connection to this Neon compute can take several
    // seconds (observed 500ms-4.5s cold). Vitest's 5s default is too tight
    // for a test doing more than one sequential DB round trip.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
