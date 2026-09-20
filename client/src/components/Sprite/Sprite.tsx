import { useState } from 'react'
import styles from './Sprite.module.css'

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
 * alternativo esparramado por cima do layout. Aqui a falha vira uma pokébola
 * desenhada em CSS, que ocupa exatamente o mesmo espaço.
 */
export function Sprite({ src, name, size = 76, className, loading = 'lazy' }: SpriteProps) {
  // guarda QUAL src falhou: dispensa efeito para limpar a flag quando src muda
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const broken = !src || failedSrc === src

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

  return (
    <img
      className={classes}
      style={style}
      src={src}
      /* alt vazio: o nome sempre aparece ao lado, e um alt longo virava texto
         solto no layout quando a imagem falhava */
      alt=""
      width={size}
      height={size}
      loading={loading}
      decoding="async"
      onError={() => setFailedSrc(src)}
    />
  )
}
