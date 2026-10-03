import { TypeBadge } from '../../../../components/TypeBadge'
import { moveEffects } from '../../../../lib/moves'
import styles from './CommandBar.module.css'
import type { PokemonMove } from '../../../../types/pokemon'

export interface CommandBarProps {
  /** Última linha relevante do log para a caixa de mensagem (estilo "What will X do?"). */
  message: string
  myTurn: boolean
  myPokemon: string | null | undefined
  /** Ações de batalha (LUTAR / POKÉMON / FUGIR) ou o menu de golpes. */
  children: React.ReactNode
  /**
   * true quando `children` já é um painel completo (o menu de golpes), como no
   * jogo: escolher LUTAR troca o menu de comandos pela lista de golpes, em vez
   * de abrir uma segunda caixa embaixo.
   */
  panelMode?: boolean
  /**
   * Golpe sob o cursor no menu de golpes. Como nos jogos, a caixa de mensagem
   * vira a ficha do golpe enquanto ele está destacado.
   */
  preview?: PokemonMove | null
}

/**
 * Barra de comandos da referência GBA: caixa de mensagem creme com borda dourada
 * dupla à esquerda (~55%) + grade de comandos à direita (~45%).
 */

export function CommandBar({
  message,
  myTurn,
  myPokemon,
  children,
  panelMode = false,
  preview = null,
}: CommandBarProps) {
  const target =
    message ||
    (myTurn
      ? `O que ${myPokemon ?? 'seu Pokémon'} vai fazer?`
      : 'Aguarde a resolução das escolhas…')
  const text = target

  return (
    <section className={styles.bar} aria-label="Comandos de batalha">
      {preview ? (
        <div className={styles.message}>
          <article className={styles.preview}>
            <header className={styles.previewHead}>
              <h3 className={styles.previewName}>{preview.displayName ?? preview.name}</h3>
              <TypeBadge type={preview.type} small />
              {preview.category && <span className={styles.category}>{preview.category}</span>}
            </header>

            <dl className={styles.previewStats}>
              <div>
                <dt>Poder</dt>
                <dd>{preview.power ?? '—'}</dd>
              </div>
              <div>
                <dt>Precisão</dt>
                <dd>{preview.accuracy != null ? `${preview.accuracy}%` : '—'}</dd>
              </div>
              <div>
                <dt>PP máx.</dt>
                <dd>{preview.pp ?? '—'}</dd>
              </div>
            </dl>

            <ul className={styles.previewEffects}>
              {moveEffects(preview)
                .slice(0, 4)
                .map((effect) => (
                  <li key={effect.label} className={styles[effect.tone]}>
                    {effect.label}
                  </li>
                ))}
            </ul>

            {preview.description && <p className={styles.previewDesc}>{preview.description}</p>}
          </article>
        </div>
      ) : (
        <div className={styles.message} role="log" aria-live="polite">
          <p className={styles.messageText}>{text}</p>
          <span className={styles.cursor} aria-hidden="true">
            ▼
          </span>
        </div>
      )}
      <div className={panelMode ? styles.panel : styles.grid}>{children}</div>
      <span className={styles.diamond} aria-hidden="true" />
    </section>
  )
}
