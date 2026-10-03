import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { PokeballSpinner } from '../../components/PokeballSpinner'
import { AudioSettings } from '../../components/AudioSettings'
import { GameIcon } from '../../components/GameIcon/GameIcon'
import { useBattleContext } from '../../context/BattleProvider'
import { useAudio } from '../../hooks/useAudio'
import { audio } from '../../lib/audio'
import styles from './HomePage.module.css'

const MAX_NAME_LENGTH = 24

/** Tela de título: nome do treinador + fila de matchmaking. */
export function HomePage() {
  const { state, connected, status, connect, leave } = useBattleContext()
  const audio_ = useAudio()
  const [name, setName] = useState('Treinador')
  const [accessKey, setAccessKey] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    audio_.playMusic('menu')
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // partida encontrada → seleção
  if (state) {
    return <Navigate to="/selecao" replace />
  }

  const waiting = connected

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    audio.unlock()
    audio.play('select')
    connect(trimmed, accessKey)
  }

  return (
    <main className={styles.page}>
      <div className={styles.scene} aria-hidden="true" />
      <header className={styles.header}>
        <span className={styles.brand}>
          <GameIcon name="ball" size={26} /> BATTLE LINK
        </span>
        <span className={styles.headerNote}>Pokémon · batalha por turnos</span>
        <AudioSettings />
      </header>
      <div className={styles.hero}>
        <section className={styles.titleCard} aria-label="Pokémon Battle">
          <p className={styles.eyebrow}>Seu próximo rival está aqui</p>
          <h1 className={`gb-title ${styles.title}`}>
            <span>Prepare.</span>
            <span>Conecte.</span>
            <span className={styles.titleAccent}>Batalhe.</span>
          </h1>
          <p className={styles.tagline}>
            Batalha por turnos · dois treinadores · tempo real. Escolha sua equipe e faça cada
            jogada contar.
          </p>
          <ol className={styles.steps} aria-label="Etapas da partida">
            <li>
              <b>01</b> Escolha seis
            </li>
            <li>
              <b>02</b> Prepare os golpes
            </li>
            <li>
              <b>03</b> Entre na arena
            </li>
          </ol>
        </section>

        <section className={`gb-panel ${styles.card}`} aria-label="Cartão de treinador">
          <header className={styles.cardHeader}>
            <GameIcon name="ball" />
            <div>
              <p className={styles.cardKicker}>Conexão de batalha</p>
              <h2 className={styles.cardTitle}>Cartão de Treinador</h2>
            </div>
          </header>

          <form
            className={styles.form}
            aria-busy={waiting}
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <label className={styles.label} htmlFor="trainer-name">
              Seu nome
            </label>
            <input
              ref={inputRef}
              id="trainer-name"
              className={styles.input}
              value={name}
              maxLength={MAX_NAME_LENGTH}
              required
              disabled={waiting}
              aria-describedby="trainer-hint"
              placeholder="Ex.: Ash"
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <details>
              <summary>O servidor exige uma chave de acesso?</summary>
              <label className={styles.label} htmlFor="access-key">
                Chave de acesso
              </label>
              <input
                id="access-key"
                className={styles.input}
                type="password"
                value={accessKey}
                maxLength={256}
                autoComplete="off"
                onChange={(event) => setAccessKey(event.target.value)}
              />
            </details>
            <Button
              type="submit"
              variant="fight"
              size="lg"
              disabled={connected || !name.trim()}
              className={styles.cta}
            >
              ENTRAR NA FILA ▶
            </Button>
          </form>

          <div
            className={styles.status}
            data-state={waiting ? 'on' : 'off'}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {waiting ? (
              <>
                <PokeballSpinner size={22} label="Procurando oponente" />
                <span className={styles.statusText}>Procurando oponente…</span>
                <button
                  className={styles.cancel}
                  onClick={() => {
                    audio.play('click')
                    leave()
                  }}
                >
                  cancelar
                </button>
              </>
            ) : (
              <span className={styles.statusText}>{status}</span>
            )}
          </div>

          <p className={styles.hint} id="trainer-hint">
            Ao entrar na fila, você encontra outro treinador para preparar uma partida.
          </p>
        </section>
      </div>
      <footer className={styles.footer}>
        <span>Seis Pokémon. Uma equipe. Sua estratégia.</span>
        <span>Pokémon Battle · Battle Link</span>
      </footer>
    </main>
  )
}
