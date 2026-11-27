import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/bridge/**/*.test.ts', 'tests/mcp/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    pool: 'forks',
    sequence: { concurrent: false }
  }
})
