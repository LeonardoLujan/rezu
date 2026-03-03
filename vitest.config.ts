import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror the "@/*" path alias from tsconfig.json so imports like
    // "@/lib/utils" resolve correctly inside tests.
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',   // simulates a browser (window, document, localStorage)
    globals: true,          // makes describe/it/expect available without importing them
    setupFiles: ['./vitest.setup.ts'],
  },
})
