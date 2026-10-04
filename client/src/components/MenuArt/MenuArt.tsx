import styles from './MenuArt.module.css'
import { MENU_ART, type MenuId } from '../../lib/menuAssets'

/** Raster artwork is decorative; interactive values and labels remain HTML. */
export function MenuScenery({ menu, panel = false }: { menu: MenuId; panel?: boolean }) {
  return <div className={`${styles.scenery} ${panel ? styles.panel : ''}`} aria-hidden="true"><img src={`/interface/${MENU_ART[menu][0]}.webp`} alt="" decoding="async" onError={event => { event.currentTarget.style.visibility = 'hidden' }} /></div>
}
export function MenuEmblem({ menu, className = '' }: { menu: Exclude<MenuId, 'home'>; className?: string }) {
  return <img className={`${styles.emblem} ${className}`} src={`/interface/${MENU_ART[menu][1]}.webp`} alt="" aria-hidden="true" decoding="async" onError={event => { event.currentTarget.style.visibility = 'hidden' }} />
}
export function Brand({ large = false }: { large?: boolean }) {
  return <img className={large ? styles.brandLarge : styles.brand} src="/interface/logo.webp" alt="Battle Link" width={large ? 780 : 240} height={large ? 260 : 80} decoding="async" />
}
