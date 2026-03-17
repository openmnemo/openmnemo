import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  banner: {
    js: '#!/usr/bin/env node',
  },
  clean: true,
})
