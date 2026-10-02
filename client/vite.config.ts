import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'server-engine-boundary',
      generateBundle() {
        for (const id of this.getModuleIds()) {
          if (/[/\\]node_modules[/\\](?:@pkmn[/\\]sim|@smogon[/\\]calc)[/\\]/.test(id)) {
            this.error('O simulador e a calculadora de referência não podem entrar no navegador.')
          }
        }
      },
    },
  ],
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'species', test: /[/\\]data[/\\]species\.json$/ },
            { name: 'moves', test: /[/\\]data[/\\]moves\.json$/ },
            { name: 'assets', test: /[/\\]data[/\\]asset-registry\.json$/ },
          ],
        },
      },
    },
  },
})
