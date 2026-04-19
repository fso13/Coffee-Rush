import { defineConfig } from 'vite'

// GitHub Pages project site: https://<user>.github.io/<repo>/
// Set VITE_BASE_PATH=/repo-name/ in CI (see .github/workflows).
const base = process.env.VITE_BASE_PATH?.trim() || '/'

export default defineConfig({
  base: base.endsWith('/') ? base : `${base}/`,
})
