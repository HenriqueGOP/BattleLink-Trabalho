import { useState } from 'react'
import styles from './Sprite.module.css'
import { menuArtworkMetrics, resolveMenuSprite, safeAsset } from '../../lib/assets'
import { spriteMetrics } from '../../lib/presentation/sceneLayout'

export interface SpriteProps {
  src: string | null | undefined
  /** Nome do Pokémon — vira rótulo acessível quando o sprite não carrega. */
  name?: string
  size?: number
  className?: string
  /** `lazy` no catálogo (1025 imagens), `eager` onde o sprite é o conteúdo. */
  loading?: 'lazy' | 'eager'
}

/**
 * Sprite de Pokémon com fallback.
 *
 * A PokeAPI não tem sprite para todas as formas e devolve 404 em várias delas.
 * Sem fallback, o navegador desenha o ícone de imagem quebrada com o texto
 * alternativo esparramado por cima do layout. A falha usa um emblema raster local.
 */
export function Sprite({ src, name, size = 76, className, loading = 'lazy' }: SpriteProps) {
  // Keep each failed URL so art -> pixel -> fallback cannot retry in a loop.
  const [failedSources, setFailedSources] = useState<ReadonlySet<string>>(() => new Set())
  const original = safeAsset(src)
  const artwork = resolveMenuSprite(original)
  const source = artwork && failedSources.has(artwork) ? original : artwork
  const broken = !source || failedSources.has(source)

  const classes = [styles.sprite, className].filter(Boolean).join(' ')
  const style = { width: size, maxWidth: '100%', aspectRatio: '1 / 1' }

  if (broken) {
    return (
      <span
        className={`${classes} ${styles.fallback}`}
        style={style}
        role="img"
        aria-label={name ? `${name} (sprite indisponível)` : 'Pokémon'}
      />
    )
  }

  const metrics = menuArtworkMetrics(source) ?? spriteMetrics(source)
  const [left, top, right, bottom] = metrics.bounds
  // Visible bounds, rather than source padding, define a stable card silhouette.
  const scale = 90 / Math.max(right - left, bottom - top, 1)
  return (
    <span
      className={classes}
      style={style}
      data-sprite-source={menuArtworkMetrics(source) ? 'artwork' : 'pixel'}
    >
      <img
        className={styles.image}
        style={{
          width: `${metrics.width * scale}%`,
          height: `${metrics.height * scale}%`,
          left: `${(100 - (right - left) * scale) / 2 - left * scale}%`,
          top: `${(100 - (bottom - top) * scale) / 2 - top * scale}%`,
        }}
        src={source}
        /* alt vazio: o nome sempre aparece ao lado, e um alt longo virava texto
         solto no layout quando a imagem falhava */
        alt=""
        width={size}
        height={size}
        loading={loading}
        decoding="async"
        onError={() => setFailedSources((previous) => new Set([...previous, source]))}
      />
    </span>
  )
}
