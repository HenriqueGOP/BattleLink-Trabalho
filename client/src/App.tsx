import { Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { BattleProvider } from './context/BattleProvider'
import { BattlePage } from './pages/BattlePage'
import { HomePage } from './pages/HomePage'
import { SelectionPage } from './pages/SelectionPage'
import { TeamSetupPage } from './pages/TeamSetupPage'
import { PresentationLab } from './pages/BattlePage/PresentationLab'

/** Roteamento + provedores globais. Zero lógica de jogo aqui. */
export default function App() {
  return (
    <ToastProvider>
      <BattleProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/selecao" element={<SelectionPage />} />
          <Route path="/equipe" element={<TeamSetupPage />} />
          <Route path="/batalha" element={<BattlePage />} />
          {import.meta.env.MODE === 'profile' && (
            <Route path="/visual-check" element={<PresentationLab />} />
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BattleProvider>
    </ToastProvider>
  )
}
