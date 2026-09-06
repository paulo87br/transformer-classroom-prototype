import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  ArrowRight, ChevronLeft, ChevronRight, Eraser, LogIn, LogOut, Maximize,
  Moon, Play, Radio, RotateCcw, Send, Sun,
} from 'lucide-react'
import { getSupabaseClient, sanitizeRoom, TransformerBus, type ConnectionState } from './supabase'
import { runTinyTransformer, STAGES, type TransformerRun } from './transformer'

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className={`brand ${compact ? 'compact' : ''}`} href="https://paulonascimento.me" target="_blank" rel="noreferrer">
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="95" fill="currentColor" />
        <circle cx="100" cy="100" r="82" fill="none" stroke="#0a0c10" strokeWidth="2" opacity=".35" />
        <g transform="translate(97 100)" fill="none" stroke="#0a0c10" strokeWidth="8">
          <path d="M-36 36V-36H-14A20 20 0 0 1-14 4H-36" />
          <path d="M8 36V-36L42 36V-36" />
        </g>
      </svg>
      <span>Paulo <em>Nascimento</em><small>Laboratório</small></span>
    </a>
  )
}

type AuthState = 'booting' | 'anonymous' | 'checking' | 'authenticated' | 'unauthorized' | 'error' | 'configuration'

function AuthGate({ children }: { children: ReactNode }) {
  const client = getSupabaseClient()
  const [state, setState] = useState<AuthState>('booting')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const authorizedId = useRef<string | null>(null)
  const pendingId = useRef<string | null>(null)

  const authorize = useCallback(async (session: Session) => {
    if (!client) return
    const id = session.user.id
    if (authorizedId.current === id) {
      setState('authenticated')
      return
    }
    if (pendingId.current === id) return
    pendingId.current = id
    const { data, error } = await client.rpc('pulso_is_admin')
    if (pendingId.current !== id) return
    pendingId.current = null
    if (error) {
      setMessage('Não foi possível validar o acesso. Tente novamente.')
      setState('error')
    } else if (data === true) {
      authorizedId.current = id
      setState('authenticated')
    } else {
      setMessage(session.user.email || 'Esta conta')
      setState('unauthorized')
    }
  }, [client])

  useEffect(() => {
    if (!client) {
      setState('configuration')
      return
    }
    let active = true
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (!active) return
        if (event === 'SIGNED_OUT') {
          authorizedId.current = null
          pendingId.current = null
          setState('anonymous')
        } else if (session && authorizedId.current !== session.user.id) {
          void authorize(session)
        }
      }, 0)
    })
    void client.auth.getSession().then(({ data }) => {
      if (!active) return
      if (data.session) void authorize(data.session)
      else setState('anonymous')
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [authorize, client])

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    if (!client) return
    setMessage('')
    setState('checking')
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password })
    if (error || !data.session) {
      setMessage('E-mail ou senha incorretos.')
      setState('anonymous')
      return
    }
    await authorize(data.session)
  }

  const signOut = async () => {
    if (!client) return
    await client.auth.signOut()
    authorizedId.current = null
    setState('anonymous')
  }

  if (state === 'authenticated') return <>{children}<button className="signout" onClick={() => void signOut()}><LogOut size={15} /> Sair</button></>

  const title = state === 'booting' ? 'Retomando sessão' : state === 'checking' ? 'Verificando acesso' : state === 'unauthorized' ? 'Conta sem acesso' : state === 'error' ? 'Conexão interrompida' : 'Entrar'
  return (
    <main className="auth-page">
      <section className="auth-shell">
        <Brand />
        <span className="eyebrow">Transformer ao Vivo</span>
        <h1>{title}</h1>
        {state === 'booting' || state === 'checking' ? <div className="loading"><i /> Restaurando seu acesso…</div>
          : state === 'configuration' ? <p className="form-error">Configure o Supabase para iniciar o laboratório.</p>
          : state === 'unauthorized' ? <p className="form-error"><strong>{message}</strong> não pertence à lista de administradores.</p>
          : state === 'error' ? <button className="button secondary" onClick={() => window.location.reload()}>Tentar novamente</button>
          : <form className="auth-form" onSubmit={(event) => void signIn(event)}>
              <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              {message && <p className="form-error">{message}</p>}
              <button className="button primary" type="submit"><LogIn size={18} /> Entrar</button>
            </form>}
      </section>
    </main>
  )
}

function Connection({ state }: { state: ConnectionState }) {
  const labels = { connecting: 'Conectando', connected: 'Ao vivo', local: 'Modo local', error: 'Sem conexão' }
  return <span className={`connection ${state}`}><i /> {labels[state]}</span>
}

function Heatmap({ data, labels }: { data: number[][]; labels: string[] }) {
  const max = Math.max(...data.flat().map(Math.abs), 0.001)
  return (
    <div className="heatmap-wrap">
      <div className="heatmap-labels">{labels.map((label, index) => <span key={`${label}-${index}`}>{label}</span>)}</div>
      <div className="heatmap" style={{ gridTemplateColumns: `repeat(${data[0]?.length || 1}, 1fr)` }}>
        {data.flatMap((row, rowIndex) => row.map((value, columnIndex) => {
          const strength = Math.abs(value) / max
          return <i key={`${rowIndex}-${columnIndex}`} style={{ opacity: 0.12 + strength * 0.88, background: value >= 0 ? 'var(--cyan)' : 'var(--gold)' }} />
        }))}
      </div>
    </div>
  )
}

function Attention({ run }: { run: TransformerRun }) {
  return (
    <div className="attention-heads">
      {run.attention.map((matrix, head) => (
        <article key={head}>
          <span>Cabeça {head + 1}</span>
          <div className="attention-grid" style={{ gridTemplateColumns: `repeat(${run.tokens.length}, 1fr)` }}>
            {matrix.flatMap((row, rowIndex) => row.map((weight, columnIndex) => (
              <i key={`${rowIndex}-${columnIndex}`} title={`${run.tokens[rowIndex]} → ${run.tokens[columnIndex]}: ${Math.round(weight * 100)}%`} style={{ opacity: weight <= 0 ? 0.035 : 0.16 + weight * 0.84 }} />
            )))}
          </div>
        </article>
      ))}
    </div>
  )
}

const stageDescriptions = [
  'A frase é dividida em unidades que o modelo consegue processar.',
  'Cada token vira um vetor numérico com doze dimensões.',
  'Sinais senoidais informam a ordem de cada token.',
  'Três cabeças calculam relações causais diferentes entre os tokens.',
  'A atenção retorna ao fluxo original e os valores são normalizados.',
  'Uma rede interna expande, transforma e comprime cada representação.',
  'Os vetores finais viram probabilidades para o próximo token.',
  'O token mais provável entra no contexto e o ciclo pode recomeçar.',
]

function StageVisual({ run, stage }: { run: TransformerRun; stage: number }) {
  if (stage === 0) return <div className="token-row">{run.tokens.map((token, index) => <span key={`${token}-${index}`}><small>{index}</small>{token}</span>)}</div>
  if (stage === 1) return <Heatmap data={run.embeddings} labels={run.tokens} />
  if (stage === 2) return <Heatmap data={run.positioned} labels={run.tokens} />
  if (stage === 3) return <Attention run={run} />
  if (stage === 4) return <Heatmap data={run.residual} labels={run.tokens} />
  if (stage === 5) return <Heatmap data={run.feedForward} labels={run.tokens} />
  if (stage === 6) return <div className="logits">{run.candidates.map((candidate) => <div key={candidate.token}><span>{candidate.token}</span><i><b style={{ width: `${candidate.probability * 100}%` }} /></i><strong>{Math.round(candidate.probability * 100)}%</strong></div>)}</div>
  return <div className="generation"><span>Próximo token</span><strong>{run.selected}</strong><p>{run.generated}</p></div>
}

function Home({ room, setRoom }: { room: string; setRoom: (value: string) => void }) {
  return (
    <main className="home-page">
      <section className="hero">
        <div><Brand /><span className="eyebrow">Laboratório de IA generativa</span><h1>Como uma máquina<br /><em>constrói uma resposta?</em></h1><p>Acompanhe tokens, vetores, atenção e probabilidades enquanto um Transformer didático processa linguagem.</p></div>
        <div className="room-panel">
          <label>Sala<input value={room} onChange={(event) => setRoom(sanitizeRoom(event.target.value))} /></label>
          <a className="route-card primary-card" href={`/display?room=${room}`}><Radio /><span><strong>Tela do projetor</strong><small>Visualização e condução da aula</small></span><ArrowRight /></a>
          <a className="route-card" href={`/input?room=${room}`}><Send /><span><strong>Entrada do aluno</strong><small>Envio de prompts pelo tablet</small></span><ArrowRight /></a>
        </div>
      </section>
    </main>
  )
}

function InputPage({ room }: { room: string }) {
  const bus = useRef<TransformerBus | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [prompt, setPrompt] = useState('Como uma inteligência artificial aprende linguagem?')
  const [sent, setSent] = useState(false)
  useEffect(() => {
    bus.current = new TransformerBus(room, 'tablet')
    bus.current.connect(setConnection)
    return () => bus.current?.disconnect()
  }, [room])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!prompt.trim()) return
    await bus.current?.send('run', { prompt: prompt.trim() })
    setSent(true)
  }
  const clear = async () => {
    setPrompt('')
    setSent(false)
    await bus.current?.send('clear')
  }
  return (
    <main className="input-page">
      <header><Brand compact /><Connection state={connection} /></header>
      <span className="eyebrow">Sala {room}</span><h1>Escreva um prompt</h1>
      <p>Use uma pergunta curta para enxergar como cada token atravessa o Transformer.</p>
      <form onSubmit={(event) => void submit(event)}>
        <textarea maxLength={180} value={prompt} onChange={(event) => { setPrompt(event.target.value); setSent(false) }} placeholder="Digite uma pergunta…" />
        <small>{prompt.length}/180 caracteres</small>
        <div className="input-actions">
          <button type="button" className="button secondary" onClick={() => void clear()}><Eraser size={18} /> Limpar</button>
          <button className="button primary" type="submit" disabled={!prompt.trim()}><Play size={18} /> Processar</button>
        </div>
      </form>
      <div className={`sent-feedback ${sent ? 'visible' : ''}`}><i /> Prompt enviado para o projetor</div>
    </main>
  )
}

function DisplayPage({ room }: { room: string }) {
  const timer = useRef<number | null>(null)
  const bus = useRef<TransformerBus | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [run, setRun] = useState<TransformerRun | null>(null)
  const [stage, setStage] = useState(0)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('transformer-theme') === 'light' ? 'light' : 'dark')
  const stop = useCallback(() => { if (timer.current) window.clearInterval(timer.current); timer.current = null }, [])
  const processPrompt = useCallback((prompt: string) => {
    stop()
    const next = runTinyTransformer(prompt)
    setRun(next)
    setStage(0)
    let value = 0
    timer.current = window.setInterval(() => {
      value += 1
      setStage(value)
      if (value >= STAGES.length - 1) stop()
    }, 1050)
  }, [stop])
  useEffect(() => {
    bus.current = new TransformerBus(room, 'projector')
    bus.current.on('run', ({ prompt }) => { if (typeof prompt === 'string') processPrompt(prompt) })
    bus.current.on('clear', () => { stop(); setRun(null); setStage(0) })
    bus.current.connect(setConnection)
    return () => { stop(); bus.current?.disconnect() }
  }, [processPrompt, room, stop])
  useEffect(() => { localStorage.setItem('transformer-theme', theme) }, [theme])
  const sample = useMemo(() => run || runTinyTransformer('Como um Transformer entende contexto?'), [run])
  const selectStage = (index: number) => { stop(); setStage(Math.max(0, Math.min(STAGES.length - 1, index))) }
  return (
    <main className={`display-page ${theme}`}>
      <header className="display-header">
        <div><Brand compact /><span className="eyebrow">Transformer generativo · Sala {room}</span><h1>Como uma máquina constrói uma resposta?</h1></div>
        <div className="header-actions"><Connection state={connection} /><button className="icon-button" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} aria-label="Alternar tema">{theme === 'dark' ? <Sun /> : <Moon />}</button><button className="icon-button" onClick={() => void document.documentElement.requestFullscreen()} aria-label="Tela cheia"><Maximize /></button></div>
      </header>
      <section className="prompt-card"><span>Prompt do aluno</span><p>{sample.prompt}</p>{!run && <small>Demonstração local — aguardando o tablet</small>}</section>
      <section className="stage-panel">
        <div className="stage-heading"><span>0{stage + 1}</span><div><small>{STAGES[stage]}</small><p>{stageDescriptions[stage]}</p></div></div>
        <StageVisual run={sample} stage={stage} />
      </section>
      <footer className="timeline">
        <div className="steps">{STAGES.map((label, index) => <button key={label} className={`${index < stage ? 'reached' : ''} ${index === stage ? 'current' : ''}`} onClick={() => selectStage(index)}><span>{index + 1}</span><b>{label}</b></button>)}</div>
        <div className="nav"><button onClick={() => selectStage(stage - 1)} disabled={stage === 0}><ChevronLeft /></button><button onClick={() => selectStage(stage + 1)} disabled={stage === STAGES.length - 1}><ChevronRight /></button><button onClick={() => processPrompt(sample.prompt)}><RotateCcw size={17} /> Repetir</button></div>
      </footer>
    </main>
  )
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(window.location.search)
  const [room, setRoomState] = useState(() => sanitizeRoom(params.get('room') || localStorage.getItem('transformer-room')))
  const setRoom = (value: string) => { setRoomState(value); localStorage.setItem('transformer-room', value) }
  let page = <Home room={room} setRoom={setRoom} />
  if (path === '/input') page = <InputPage room={room} />
  if (path === '/display') page = <DisplayPage room={room} />
  return <AuthGate>{page}</AuthGate>
}
