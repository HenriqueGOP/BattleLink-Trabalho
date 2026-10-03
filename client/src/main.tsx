import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/nunito-sans/latin-400.css'
import '@fontsource/nunito-sans/latin-ext-400.css'
import '@fontsource/nunito-sans/latin-600.css'
import '@fontsource/nunito-sans/latin-ext-600.css'
import '@fontsource/nunito-sans/latin-700.css'
import '@fontsource/nunito-sans/latin-ext-700.css'
import '@fontsource/oxanium/latin-600.css'
import '@fontsource/oxanium/latin-ext-600.css'
import '@fontsource/oxanium/latin-700.css'
import '@fontsource/oxanium/latin-ext-700.css'
import 'tailwindcss'
import './styles/tokens.css'
import './styles/effects.css'
import './styles/global.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
