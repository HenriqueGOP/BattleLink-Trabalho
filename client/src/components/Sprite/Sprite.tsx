import { useState } from 'react'
import styles from './Sprite.module.css'
import { safeAsset } from '../../lib/assets'
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
  // guarda QUAL src falhou: dispensa efeito para limpar a flag quando src muda
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const broken = !safeAsset(src) || failedSrc === src

  const classes = [styles.sprite, className].filter(Boolean).join(' ')
  const style = { width: size, height: size }

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

  const source = safeAsset(src)!
  const metrics = spriteMetrics(source)
  const [left, top, right, bottom] = metrics.bounds
  const scale = size * .85 / Math.max(right - left, bottom - top, 1)
  return (
    <span className={classes} style={style}>
    <img
      className={styles.image}
      style={{ width: metrics.width * scale, height: metrics.height * scale, left: (size - (right - left) * scale) / 2 - left * scale, top: (size - (bottom - top) * scale) / 2 - top * scale }}
      src={safeAsset(src) ?? undefined}
      /* alt vazio: o nome sempre aparece ao lado, e um alt longo virava texto
         solto no layout quando a imagem falhava */
      alt=""
      width={size}
      height={size}
      loading={loading}
      decoding="async"
      onError={() => setFailedSrc(src ?? null)}
    />
    </span>
  )
}
