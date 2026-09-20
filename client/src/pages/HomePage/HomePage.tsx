import { useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { PokeballSpinner } from '../../components/PokeballSpinner'
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
    connect(trimmed)
  }

  return (
    <main className={styles.page}>
      {/* céu + chão desenhados, no lugar dos gradientes soltos de antes */}
      <div className={styles.scene} aria-hidden="true">
        <span className={styles.ground} />
        <span className={`${styles.cloud} ${styles.cloudOne}`} />
        <span className={`${styles.cloud} ${styles.cloudTwo}`} />
      </div>

      <section className={styles.titleCard} aria-label="Pokémon Battle">
        <span className={`gb-ball ${styles.logoBall}`} aria-hidden="true" />
        <h1 className={`gb-title ${styles.title}`}>
          <span className={styles.titleTop}>POKéMON</span>
          <span className={styles.titleBottom}>BATTLE</span>
        </h1>
        <p className={styles.tagline}>Batalha por turnos · dois treinadores · tempo real</p>
      </section>

      <section className={`gb-panel ${styles.card}`} aria-label="Cartão de treinador">
        <header className={styles.cardHeader}>
          <span className={`gb-ball ${styles.ballMark}`} aria-hidden="true" />
          <h2 className={styles.cardTitle}>Cartão de Treinador</h2>
        </header>

        <form
          className={styles.form}
          onSubmit={event => {
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
            placeholder="Ex.: Ash"
            onChange={event => setName(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" variant="fight" size="lg" disabled={!name.trim()} className={styles.cta}>
            ENTRAR NA FILA ▶
          </Button>
        </form>

        <div className={styles.status} data-state={waiting ? 'on' : 'off'}>
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

        <p className={styles.hint}>
          Dois navegadores = duas vagas na fila. O servidor emparelha aos pares.
        </p>
      </section>
    </main>
  )
}
