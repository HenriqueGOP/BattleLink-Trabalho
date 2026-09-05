import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Player = { id: string; name: string; pokemon: string | null; hp: number; maxHp: number; energy: number }
type GameState = { phase: 'battle' | 'finished'; players: [Player, Player]; turn: 0 | 1; log: string[]; winner: string | null }
type ServerMessage =
  | { type: 'welcome'; playerId: string; protocol: string }
  | { type: 'waiting'; message: string }
  | { type: 'match_found'; roomId: string; state: GameState }
  | { type: 'state'; state: GameState }
  | { type: 'error'; code: string; message: string }
  | { type: 'opponent_left'; message: string }

const pokemons = [
  { id: 'charizard', label: 'Charizard', type: 'Fogo', hp: 100, icon: '🔥' },
  { id: 'blastoise', label: 'Blastoise', type: 'Água', hp: 110, icon: '💧' },
  { id: 'venusaur', label: 'Venusaur', type: 'Planta', hp: 105, icon: '🌿' },
]

function App() {
  const [name, setName] = useState('Treinador')
  const [connected, setConnected] = useState(false)
  const [playerId, setPlayerId] = useState('')
  const [status, setStatus] = useState('Digite seu nome para entrar na fila.')
  const [state, setState] = useState<GameState | null>(null)
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const [error, setError] = useState('')

  const myIndex = useMemo(() => state?.players.findIndex(player => player.id === playerId) ?? -1, [playerId, state])
  const myPlayer = myIndex >= 0 && state ? state.players[myIndex] : null
  const opponent = myIndex >= 0 && state ? state.players[1 - myIndex] : null
  const myTurn = state !== null && myIndex === state.turn
  const readyToChoose = state?.phase === 'battle' && Boolean(myPlayer && !myPlayer.pokemon)

  useEffect(() => () => socket?.close(), [socket])

  function send(message: object) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }

  function connect() {
    setError('')
    const connection = new WebSocket(import.meta.env.VITE_WS_URL ?? 'ws://127.0.0.1:3002')
    connection.onopen = () => setStatus('Conectado. Procurando um oponente...')
    connection.onmessage = event => {
      const message = JSON.parse(event.data) as ServerMessage
      if (message.type === 'welcome') { setPlayerId(message.playerId); setConnected(true); connection.send(JSON.stringify({ type: 'join', name })) }
      if (message.type === 'waiting') setStatus(message.message)
      if (message.type === 'match_found') { setState(message.state); setStatus(`Partida ${message.roomId} encontrada`) }
      if (message.type === 'state') { setState(message.state); setStatus(message.state.phase === 'finished' ? 'Batalha encerrada' : 'Estado sincronizado pelo servidor') }
      if (message.type === 'error') setError(message.message)
      if (message.type === 'opponent_left') { setStatus(message.message); setError('A partida foi interrompida.') }
    }
    connection.onerror = () => { setError('Não foi possível conectar. Inicie o servidor primeiro.'); setConnected(false) }
    connection.onclose = () => setConnected(false)
    setSocket(connection)
  }

  function choose(pokemon: string) { setError(''); send({ type: 'choose_pokemon', pokemon }) }
  function action(type: 'attack' | 'defend' | 'special', move?: string) { setError(''); send({ type: 'action', action: { type, move } }) }

  if (!connected || !state) return (
    <main className="lobby-shell">
      <div className="grain" />
      <section className="lobby-copy"><p className="eyebrow">POKÉMON BATTLE / TCP + WEBSOCKET</p><h1>Entre na arena.</h1><p className="lead">Uma batalha local em que cada decisão viaja pelo servidor e volta como estado oficial.</p><div className="signal"><span /> {status}</div></section>
      <section className="lobby-panel"><div className="pokeball">◓</div><h2>Identifique seu treinador</h2><label htmlFor="name">Nome exibido na partida</label><input id="name" value={name} maxLength={24} onChange={event => setName(event.target.value)} onKeyDown={event => event.key === 'Enter' && connect()} /><button className="primary" onClick={connect} disabled={!name.trim()}>Entrar na fila <span>↗</span></button>{error && <p className="error">{error}</p>}<p className="micro">Servidor local · ws://127.0.0.1:3002</p></section>
    </main>
  )

  return (
    <main className="arena-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">◓</span><span>POKÉMON <b>BATTLE</b></span></div><div className="connection"><i /> {status}</div><button className="ghost" onClick={() => { send({ type: 'leave' }); socket?.close() }}>Sair</button></header>
      <section className="arena-heading"><div><p className="eyebrow">SALA EM JOGO</p><h1>{state.phase === 'finished' ? 'A batalha terminou.' : myTurn ? 'Sua vez de agir.' : 'Aguarde o adversário.'}</h1></div><div className={`turn-badge ${myTurn ? 'active' : ''}`}><span>TURN</span><strong>{state.phase === 'finished' ? 'END' : `${state.turn + 1} / 2`}</strong></div></section>
      {error && <div className="error-banner">{error}</div>}
      {readyToChoose ? <section className="selection"><div className="section-label"><span>01</span><h2>Escolha seu parceiro</h2><p>O servidor vai definir seus atributos.</p></div><div className="pokemon-grid">{pokemons.map(pokemon => <button className="pokemon-card" key={pokemon.id} onClick={() => choose(pokemon.id)}><span className="pokemon-icon">{pokemon.icon}</span><span className="pokemon-name">{pokemon.label}</span><span className="pokemon-type">{pokemon.type} · {pokemon.hp} HP</span><span className="choose-arrow">↗</span></button>)}</div></section> : <section className="battle-layout"><div className="combat-column"><PlayerCard player={opponent} opponent /><div className="versus"><span>VS</span><i /></div><PlayerCard player={myPlayer} /></div><aside className="control-panel"><div className="section-label"><span>02</span><h2>Comandos</h2><p>{myTurn ? 'Escolha uma ação para continuar.' : 'O turno pertence ao outro jogador.'}</p></div><div className="action-list"><button disabled={!myTurn || myPlayer?.energy === 0} onClick={() => action('attack', 'flamethrower')}><b>ATAQUE</b><span>Flamethrower · 15 dano</span><em>1 energia</em></button><button disabled={!myTurn || myPlayer?.energy === 0} onClick={() => action('defend')}><b>DEFESA</b><span>Recupera 5 HP</span><em>1 energia</em></button><button disabled={!myTurn || (myPlayer?.energy ?? 0) < 3} onClick={() => action('special')}><b>ESPECIAL</b><span>Golpe intenso · 40 dano</span><em>3 energia</em></button></div></aside></section>}
      <section className="log-panel"><div className="section-label"><span>LOG</span><h2>Registro da partida</h2></div><div className="log-list">{state.log.slice(-5).reverse().map((entry, index) => <p key={`${entry}-${index}`}><i />{entry}</p>)}</div></section>
    </main>
  )
}

function PlayerCard({ player, opponent = false }: { player: Player | null; opponent?: boolean }) {
  const definition = pokemons.find(pokemon => pokemon.id === player?.pokemon)
  const percentage = player && player.maxHp > 0 ? Math.max(0, (player.hp / player.maxHp) * 100) : 0
  return <article className={`player-card ${opponent ? 'opponent' : 'self'}`}><div className="card-top"><span className="player-role">{opponent ? 'OPONENTE' : 'VOCÊ'}</span><span className="player-energy">⚡ {player?.energy ?? 0}</span></div><div className="fighter"><span className="fighter-icon">{definition?.icon ?? '◌'}</span><div><h2>{player?.name ?? 'Aguardando...'}</h2><p>{definition?.label ?? 'Escolha um Pokémon'}</p></div></div><div className="health-row"><span>HP</span><b>{player?.hp ?? 0} / {player?.maxHp ?? 0}</b></div><div className="health-track"><i style={{ width: `${percentage}%` }} /></div></article>
}

export default App
