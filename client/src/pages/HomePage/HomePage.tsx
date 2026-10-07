import { useState, useRef, type CSSProperties } from 'react'
import { Navigate } from 'react-router-dom'
import { FORMATS, type FormatChoice, type FormatId } from '../../../../server/src/contracts/formats'
import { TRAINERS, type Difficulty } from '../../../../server/src/contracts/trainers'
import { TYPE_IDS, type TypeId } from '../../../../server/src/game/engine/types'
import { useBattleContext, type PlayIntent } from '../../context/BattleProvider'
import { Button } from '../../components/Button'
import { AudioSettings } from '../../components/AudioSettings'
import { TrainerArt } from '../../components/TrainerArt/TrainerArt'
import { TypeBadge } from '../../components/TypeBadge'
import { Brand, MenuEmblem, MenuScenery } from '../../components/MenuArt/MenuArt'
import { typeLabel, formatPokemonName } from '../../lib/format'
import { audio } from '../../lib/audio'
import { trainerAssets } from '../../lib/trainerAssets'
import styles from './HomePage.module.css'

function MenuFooter() {
  return <footer className={styles.footer}><span>BATTLE LINK · Encontros que viram histórias.</span><span>Pokémon Battle</span></footer>
}

export function HomePage() {
  const { state, connect, connected, sessionName, status, lobby, waiting, modePending, leave, cancelQueue } = useBattleContext()
  const [name, setName] = useState(() => sessionName || localStorage.getItem('battle-name') || 'Treinador')
  const [accessKey, setAccessKey] = useState('')
  const [chosenMode, setMode] = useState<'automatic' | 'private' | 'pve'>('automatic')
  const [opened, setOpened] = useState(false)
  const mode = lobby ? 'private' : chosenMode
  const [formatId, setFormatId] = useState<FormatId>('classic')
  const [type, setType] = useState<TypeId>('water')
  const [code, setCode] = useState('')
  const [invite, setInvite] = useState(false)
  const [selectedId, setSelectedId] = useState('vespera')
  const [difficulty, setDifficulty] = useState<Difficulty>('normal')
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const selected = TRAINERS.find(trainer => trainer.id === selectedId)!
  if (state) return <Navigate to={state.phase === 'setup' && !state.players[state.wire.viewer === 'p1' ? 0 : 1].ready ? '/selecao' : '/batalha'} replace />
  const busy = waiting || modePending || Boolean(lobby)
  const format: FormatChoice = formatId === 'monotype' ? { id: formatId, type: mode === 'pve' ? selected.type : type } : { id: formatId }
  function play() {
    const trimmed = name.trim()
    if (!trimmed || busy) { inputRef.current?.focus(); return }
    localStorage.setItem('battle-name', trimmed)
    audio.unlock(); audio.play('select')
    const intent: PlayIntent = mode === 'automatic' ? { mode, format }
      : mode === 'pve' ? { mode, format, trainerId: selectedId, difficulty }
      : invite ? { mode: 'invite', code } : { mode: 'create', format }
    connect(trimmed, accessKey, intent)
  }
  if (!opened && !busy && !lobby) return <main className={`${styles.page} ${styles.landing}`}>
    <MenuScenery menu="home" viewport softened />
    <header className={styles.landingTools}><AudioSettings /></header>
    <section className={styles.landingContent} aria-label="Escolha como jogar">
      <Brand large />
      <h1 className="sr-only">Escolha como jogar Battle Link</h1>
      <nav className={styles.modeCards} aria-label="Modo de jogo">
        {([['automatic', 'Partida rápida', 'Encontre outro treinador e comece a batalhar.'], ['private', 'Jogar com amigos', 'Convide por código e batalhe com amigos.'], ['pve', 'Desafios PvE', 'Conheça nossos treinadores e desafios.']] as const).map(([id, title, note], index) => <button key={id} data-choice={id} onClick={() => { audio.play('select'); setMode(id); setOpened(true) }}><span className={styles.modeIcon} style={{ backgroundPosition: `${index * 50}% center` }} aria-hidden="true" /><strong>{title}</strong><span>{note}</span></button>)}
      </nav>
    </section>
    <MenuFooter />
  </main>
  return <main className={`${styles.page} ${styles.launcher}`} data-mode={mode}>
    <MenuScenery menu={mode === 'pve' ? 'pve' : lobby ? 'waiting' : mode === 'private' ? 'friends' : 'quick'} viewport source={mode === 'pve' ? trainerAssets(selected.id)?.background : undefined} />
    <header className={styles.header}><Brand /><span className={styles.headerNote}>Sua equipe. Seu próximo desafio.</span><AudioSettings /></header>
    <div className={styles.hub}>
      <div className={styles.hubHeading}><div><p className={styles.eyebrow}>Escolha seu caminho</p><h1 className="gb-title">Toda batalha conta uma história.</h1></div><Button variant="ghost" disabled={busy} onClick={() => setOpened(false)}>← Voltar</Button></div>
      <nav className={styles.modeTabs} aria-label="Modo de jogo">
        {([['automatic', 'Partida rápida', 'Encontre outro treinador'], ['private', 'Jogar com amigos', 'Convide por código'], ['pve', 'Desafios PvE', 'Conheça nossos treinadores']] as const).map(([id, title, note]) => <button key={id} aria-pressed={mode === id} disabled={busy} onClick={() => setMode(id)}><strong>{title}</strong><span>{note}</span></button>)}
      </nav>
      <div className={styles.hubContent}>
        <section className={`gb-panel ${styles.card}`} aria-label="Cartão de treinador">
          <header className={styles.cardHeader}><MenuEmblem menu={lobby ? 'waiting' : mode === 'automatic' ? 'quick' : mode === 'private' ? 'friends' : 'pve'} /><div><p className={styles.cardKicker}>Conexão de batalha</p><h2 className={styles.cardTitle}>Cartão de Treinador</h2></div></header>
          <form className={styles.form} aria-busy={modePending} onSubmit={event => { event.preventDefault(); play() }}>
            <label className={styles.label} htmlFor="trainer-name">Seu nome</label>
            <input ref={inputRef} id="trainer-name" className={styles.input} value={name} maxLength={24} required disabled={busy || connected} onChange={event => setName(event.target.value)} autoComplete="off" spellCheck={false} />
            <details><summary>O servidor exige uma chave de acesso?</summary><label className={styles.label} htmlFor="access-key">Chave de acesso</label><input id="access-key" className={styles.input} type="password" value={accessKey} maxLength={256} disabled={connected} autoComplete="off" onChange={event => setAccessKey(event.target.value)} /></details>
            {mode === 'private' && !lobby && <div className={styles.choiceRow}><button type="button" aria-pressed={!invite} disabled={busy} onClick={() => setInvite(false)}>Criar sala</button><button type="button" aria-pressed={invite} disabled={busy} onClick={() => setInvite(true)}>Tenho um código</button></div>}
            {mode === 'private' && invite && !lobby ? <><label htmlFor="room-code">Código do convite</label><input id="room-code" className={styles.input} placeholder="ABCD2345" value={code} maxLength={16} required disabled={busy} onChange={event => setCode(event.target.value.toUpperCase())} /></> : !lobby && <>
              <label htmlFor="battle-format">Formato da batalha</label><select id="battle-format" className={styles.input} value={formatId} disabled={busy} onChange={event => setFormatId(event.target.value as FormatId)}>{FORMATS.map(format => <option key={format.id} value={format.id}>{format.name} · {format.teamSize} Pokémon</option>)}</select>
              {formatId === 'monotype' && (mode === 'pve' ? <p>Desafio de <TypeBadge type={selected.type} small /> com {selected.name}</p> : <><label htmlFor="theme-type">Tipo da equipe</label><select id="theme-type" className={styles.input} value={type} disabled={busy} onChange={event => setType(event.target.value as TypeId)}>{TYPE_IDS.map(type => <option key={type} value={type}>{typeLabel(type)}</option>)}</select></>)}
              {mode === 'pve' && <><label htmlFor="bot-difficulty">Dificuldade</label><select id="bot-difficulty" className={styles.input} value={difficulty} disabled={busy} onChange={event => setDifficulty(event.target.value as Difficulty)}><option value="easy">Fácil · primeiros passos</option><option value="normal">Normal · uma boa disputa</option><option value="hard">Difícil · pense na próxima jogada</option></select></>}
            </>}
            {!lobby && <Button type="submit" variant="fight" size="lg" disabled={busy || !name.trim()} className={styles.cta}>{mode === 'automatic' ? 'ENTRAR NA FILA ▶' : mode === 'pve' ? `Desafiar ${selected.name} ▶` : invite ? 'Entrar na sala ▶' : 'Criar sala privada ▶'}</Button>}
          </form>
          {(connected || busy || !status.startsWith('Digite seu nome')) && <div className={styles.status} role="status" aria-live="polite"><span>{status}</span>{waiting && <Button size="sm" onClick={cancelQueue}>Cancelar busca</Button>}</div>}
          {lobby && <div className={styles.invitation}><small>Seu código de convite</small><strong>{lobby.code.slice(0, 4)} {lobby.code.slice(4)}</strong><Button onClick={() => { void navigator.clipboard.writeText(lobby.code).then(() => setCopied(true)).catch(() => setCopied(false)) }}>{copied ? 'Código copiado ✓' : 'Copiar código'}</Button><p>{lobby.players.map(player => player.name).join(' · ')} · aguardando amigo</p><Button variant="ghost" onClick={leave}>Sair da sala</Button></div>}
          <p className={styles.hint}>{mode === 'pve' ? 'Mesmas regras e atributos. A dificuldade muda a estratégia do treinador.' : mode === 'private' ? 'Compartilhe o código com um amigo. O convite expira após 15 minutos de inatividade.' : 'A busca reúne treinadores que escolheram o mesmo formato.'}</p>
        </section>
        {mode === 'pve' ? <section className={styles.challenge} style={{ '--trainer-color': selected.color } as CSSProperties} aria-label="Treinadores de desafio">
          <div className={styles.spotlight}><MenuScenery menu="pve" panel source={trainerAssets(selected.id)?.background} /><div className={styles.trainerStory}><span className={styles.cardKicker}>Seu próximo adversário</span><h2>{selected.name}</h2><strong>{selected.title}</strong><p>{selected.description}</p><blockquote>“{selected.greeting}”</blockquote><span className={styles.partner}>Parceiro assinatura · {formatPokemonName(selected.signature)}</span><TypeBadge type={selected.type} small /></div><TrainerArt key={selected.id} id={selected.id} className={styles.heroArt} /></div>
          <div className={styles.trainerGrid}>{TRAINERS.map(trainer => <button key={trainer.id} className={styles.trainerTile} aria-pressed={selectedId === trainer.id} disabled={busy} onClick={() => setSelectedId(trainer.id)} style={{ '--trainer-color': trainer.color } as CSSProperties}><TrainerArt id={trainer.id} compact /><span>{trainer.name}</span><small>{typeLabel(trainer.type)}</small></button>)}</div>
        </section> : <section className={styles.welcomePanel}><MenuScenery menu={lobby ? 'waiting' : mode === 'private' ? 'friends' : 'quick'} panel /><span className={styles.cardKicker}>{lobby ? 'Um lugar reservado para seu amigo' : mode === 'private' ? 'Um convite. Uma rivalidade.' : 'Seu próximo rival está aqui'}</span><h2>{lobby ? 'Seu convite está pronto.' : mode === 'private' ? 'A melhor disputa é entre amigos.' : 'Prepare. Conecte. Batalhe.'}</h2><p>{lobby ? 'Copie o código ao lado e compartilhe com seu amigo. A preparação começa quando ele entrar.' : mode === 'private' ? 'Monte sua equipe, combine o desafio e continue na mesma sala para uma revanche.' : 'Escolha seus parceiros e encontre alguém para colocar sua estratégia à prova.'}</p></section>}
      </div>
    </div><MenuFooter />
  </main>
}
