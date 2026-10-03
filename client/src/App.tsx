import { lazy, Suspense, useLayoutEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { BattleProvider } from './context/BattleProvider'
import { HomePage } from './pages/HomePage'
import { useRootMotionPreference } from './hooks/useMotionPreference'

const BattlePage = lazy(() =>
  import('./pages/BattlePage').then((module) => ({ default: module.BattlePage }))
)
const SelectionPage = lazy(() =>
  import('./pages/SelectionPage').then((module) => ({ default: module.SelectionPage }))
)
const TeamSetupPage = lazy(() =>
  import('./pages/TeamSetupPage').then((module) => ({ default: module.TeamSetupPage }))
)
const PresentationLab =
  import.meta.env.DEV || import.meta.env.MODE === 'profile'
    ? lazy(() =>
        import('./pages/BattlePage/PresentationLab').then((module) => ({
          default: module.PresentationLab,
        }))
      )
    : null

function RouteFocus() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    const heading = document.querySelector<HTMLElement>('main h1, main h2')
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1
      heading.focus({ preventScroll: true })
    }
  }, [pathname])
  return null
}

/** Roteamento + provedores globais. Zero lógica de jogo aqui. */
export default function App() {
  useRootMotionPreference()
  return (
    <ToastProvider>
      <BattleProvider>
        <Suspense
          fallback={
            <main role="status" style={{ padding: 32, textAlign: 'center' }}>
              Abrindo a próxima tela…
            </main>
          }
        >
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/selecao" element={<SelectionPage />} />
            <Route path="/equipe" element={<TeamSetupPage />} />
            <Route path="/batalha" element={<BattlePage />} />
            {PresentationLab && <Route path="/visual-check" element={<PresentationLab />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <RouteFocus />
        </Suspense>
      </BattleProvider>
    </ToastProvider>
  )
}
