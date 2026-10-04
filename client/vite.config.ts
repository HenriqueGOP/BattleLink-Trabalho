import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  resolve:
    mode === 'profile' ? { alias: { 'react-dom/client': 'react-dom/profiling' } } : undefined,
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'server-engine-boundary',
      generateBundle(_options, bundle) {
        for (const id of this.getModuleIds()) {
          if (/[/\\]node_modules[/\\](?:@pkmn[/\\]sim|@smogon[/\\]calc)[/\\]/.test(id)) {
            this.error('O simulador e a calculadora de referência não podem entrar no navegador.')
          }
        }
        if (mode !== 'profile') {
          for (const chunk of Object.values(bundle)) {
            if (
              chunk.type === 'chunk' &&
              Object.keys(chunk.modules).some((id) =>
                /(?:presentation-fixture\.json|[/\\]PresentationLab\.tsx|[/\\]SpriteGallery\.tsx)$/.test(
                  id
                )
              )
            ) {
              this.error('O laboratório e suas fixtures não podem entrar no build de produção.')
            }
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
            { name: 'animated-assets', test: /[/\\]data[/\\]animated-registry\.json$/ },
            { name: 'sprite-metrics', test: /[/\\]data[/\\]sprite-metrics\.json$/ },
            { name: 'react', test: /[/\\]node_modules[/\\](?:react|react-dom|scheduler)[/\\]/ },
            { name: 'animation', test: /[/\\]node_modules[/\\]gsap[/\\]/ },
          ],
        },
      },
    },
  },
}))
