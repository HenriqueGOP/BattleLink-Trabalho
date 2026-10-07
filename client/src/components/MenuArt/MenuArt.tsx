import styles from './MenuArt.module.css'
import { MENU_ART, type MenuId } from '../../lib/menuAssets'

/** Raster artwork is decorative; interactive values and labels remain HTML. */
export function MenuScenery({ menu, panel = false, viewport = false, softened = false, source }: { menu: MenuId; panel?: boolean; viewport?: boolean; softened?: boolean; source?: string }) {
  const fallback = `/interface/${MENU_ART[menu][0]}.webp`
  const image = source ?? fallback
  return <div className={`${styles.scenery} ${panel ? styles.panel : ''} ${viewport ? styles.viewport : ''} ${softened ? styles.softened : ''}`} data-menu-scenery={menu} data-scope={viewport ? 'viewport' : 'panel'} aria-hidden="true"><img key={image} src={image} alt="" decoding="async" onError={event => {
    const target = event.currentTarget
    if (image !== fallback && !target.dataset.fallback) {
      target.dataset.fallback = 'true'
      target.src = fallback
    } else target.style.visibility = 'hidden'
  }} /></div>
}
export function MenuEmblem({ menu, className = '' }: { menu: Exclude<MenuId, 'home'>; className?: string }) {
  return <img className={`${styles.emblem} ${className}`} src={`/interface/${MENU_ART[menu][1]}.webp`} alt="" aria-hidden="true" decoding="async" onError={event => { event.currentTarget.style.visibility = 'hidden' }} />
}
export function Brand({ large = false }: { large?: boolean }) {
  return <img className={large ? styles.brandLarge : styles.brand} src="/interface/logo.webp" alt="Battle Link" width={large ? 780 : 240} height={large ? 260 : 80} decoding="async" />
}
