import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  ArrowRight, ChevronLeft, ChevronRight, Eraser, LogIn, LogOut, Maximize,
  Moon, Pause, Play, Radio, RotateCcw, Send, Sun,
} from 'lucide-react'
import { getSupabaseClient, sanitizeRoom, TransformerBus, type ConnectionState } from './supabase'
import {
  generateTransformerSequence, STAGES, type GenerationOptions, type TransformerRun,
} from './transformer'
import { TransformerScene } from './TransformerScene'

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
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setMessage('Não foi possível restaurar sua sessão. Tente novamente.')
        setState('error')
      } else if (data.session) void authorize(data.session)
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
    pendingId.current = null
    setPassword('')
    setMessage('')
    setState('anonymous')
  }

  const retryAuthorization = async () => {
    if (!client) return
    setMessage('')
    setState('checking')
    const { data, error } = await client.auth.getSession()
    if (error || !data.session) {
      authorizedId.current = null
      pendingId.current = null
      setState('anonymous')
      return
    }
    await authorize(data.session)
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
          : state === 'unauthorized' ? <div className="auth-form">
              <p className="form-error"><strong>{message}</strong> não pertence à lista de administradores.</p>
              <button className="button secondary" type="button" onClick={() => void signOut()}><LogOut size={18} /> Usar outra conta</button>
            </div>
          : state === 'error' ? <div className="auth-form">
              <p className="form-error">{message}</p>
              <button className="button secondary" type="button" onClick={() => void retryAuthorization()}><RotateCcw size={18} /> Tentar novamente</button>
              <button className="button secondary" type="button" onClick={() => void signOut()}><LogOut size={18} /> Sair</button>
            </div>
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

const STAGE_STORIES = [
  { technical: 'Tokenização', title: 'Separar o texto', explanation: 'A máquina começa dividindo a frase em pequenas partes. Ela ainda não entende o assunto: apenas organiza o material que recebeu.', analogy: 'Como separar uma petição em fatos, fundamentos e pedidos antes de iniciar a leitura.' },
  { technical: 'Embeddings', title: 'Transformar palavras em números', explanation: 'Computadores calculam números, não palavras. Cada parte do texto recebe uma representação numérica que permite comparações.', analogy: 'Como cadastrar cada documento por assunto, origem e relevância para poder relacioná-los depois.' },
  { technical: 'Codificação posicional', title: 'Registrar a ordem', explanation: 'A posição muda o sentido. O modelo marca onde cada parte aparece para não tratar frases com palavras iguais como se fossem idênticas.', analogy: '“O autor acusa o réu” não significa o mesmo que “o réu acusa o autor”.' },
  { technical: 'Autoatenção', title: 'Procurar relações', explanation: 'Cada parte consulta as anteriores e decide quais ajudam mais a interpretar o que está sendo lido agora.', analogy: 'Como perceber que “ela” retoma uma pessoa citada antes ou que uma exceção altera uma regra anterior.' },
  { technical: 'Conexão residual', title: 'Preservar o texto original', explanation: 'As relações encontradas são acrescentadas sem apagar a informação inicial. Isso reduz a perda de sentido ao longo do caminho.', analogy: 'Como fazer anotações sobre uma lei mantendo o texto legal sempre disponível para conferência.' },
  { technical: 'Rede feed-forward', title: 'Refinar a interpretação', explanation: 'O modelo faz uma revisão interna de cada parte já contextualizada e destaca combinações que podem ser úteis para continuar.', analogy: 'Como reler um argumento depois de conhecer todo o contexto do caso.' },
  { technical: 'Logits e probabilidades', title: 'Comparar continuações', explanation: 'Várias palavras possíveis recebem uma pontuação. A máquina não encontra uma resposta pronta: ela escolhe entre alternativas.', analogy: 'Como ordenar hipóteses por plausibilidade — maior pontuação não significa certeza.' },
  { technical: 'Decodificação autoregressiva', title: 'Escolher e começar de novo', explanation: 'Uma palavra é adicionada ao texto. Em seguida, todo o processo se repete para escolher a próxima, uma por vez.', analogy: 'A resposta nasce gradualmente; o modelo relê o que já escreveu antes de continuar.' },
] as const

function stageEvidence(run: TransformerRun, stage: number) {
  if (stage === 0) return `${Math.max(0, run.tokens.length - 1)} partes identificadas no texto`
  if (stage === 1) return `Cada parte virou um conjunto de 12 números`
  if (stage === 2) return `A ordem de ${Math.max(0, run.tokens.length - 1)} partes foi registrada`
  if (stage === 3) {
    const weights = run.attention[0]?.at(-1) || []
    const strongest = weights.reduce((best, value, index) => value > best.value ? { value, index } : best, { value: -1, index: 0 })
    return `Nesta leitura, “${run.tokens.at(-1)}” consultou mais “${run.tokens[strongest.index]}”`
  }
  if (stage === 4) return 'A informação inicial foi mantida junto das novas relações'
  if (stage === 5) return 'A representação foi ampliada, revisada e condensada novamente'
  if (stage === 6) return run.candidates.slice(0, 3).map((candidate) => `${candidate.token} ${Math.round(candidate.probability * 100)}%`).join(' · ')
  return `Palavra escolhida: “${run.selected}”`
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
  const [temperature, setTemperature] = useState(.7)
  const [maxTokens, setMaxTokens] = useState(3)
  const [sent, setSent] = useState(false)
  useEffect(() => {
    bus.current = new TransformerBus(room, 'tablet')
    bus.current.connect(setConnection)
    return () => bus.current?.disconnect()
  }, [room])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!prompt.trim()) return
    await bus.current?.send('run', { prompt: prompt.trim(), temperature, maxTokens })
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
      <p>Faça uma pergunta curta. A projeção mostrará como a máquina separa o texto, procura relações e escolhe cada palavra da resposta.</p>
      <form onSubmit={(event) => void submit(event)}>
        <textarea maxLength={180} value={prompt} onChange={(event) => { setPrompt(event.target.value); setSent(false) }} placeholder="Digite uma pergunta…" />
        <small>{prompt.length}/180 caracteres</small>
        <div className="generation-settings">
          <label><span>Liberdade de escolha <strong>{temperature.toFixed(1)}</strong></span><input type="range" min="0.2" max="1.4" step="0.1" value={temperature} onChange={(event) => { setTemperature(Number(event.target.value)); setSent(false) }} /><small>Mais previsível</small><small>Mais variada</small></label>
          <fieldset><legend>Palavras a acompanhar</legend>{[1, 3, 5].map((value) => <button key={value} type="button" className={maxTokens === value ? 'active' : ''} onClick={() => { setMaxTokens(value); setSent(false) }}>{value}</button>)}</fieldset>
        </div>
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
  const [runs, setRuns] = useState<TransformerRun[]>([])
  const [cycle, setCycle] = useState(0)
  const [stage, setStage] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isDemo, setIsDemo] = useState(true)
  const [viewResetId, setViewResetId] = useState(0)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('transformer-theme') === 'light' ? 'light' : 'dark')
  const stop = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    setIsPlaying(false)
  }, [])
  const processPrompt = useCallback((prompt: string, options: GenerationOptions = { temperature: .7, maxTokens: 3 }, demo = false) => {
    stop()
    const nextRuns = generateTransformerSequence(prompt, options)
    setRuns(nextRuns)
    setIsDemo(demo)
    setCycle(0)
    setStage(0)
    setIsPlaying(true)
    let stageValue = 0
    let cycleValue = 0
    timer.current = window.setInterval(() => {
      if (stageValue < STAGES.length - 1) {
        stageValue += 1
        setStage(stageValue)
      } else if (cycleValue < nextRuns.length - 1) {
        cycleValue += 1
        stageValue = 0
        setCycle(cycleValue)
        setStage(0)
      } else stop()
    }, 1250)
  }, [stop])

  useEffect(() => {
    processPrompt('Como uma decisão anterior influencia um novo caso?', { temperature: .7, maxTokens: 3 }, true)
    return stop
  }, [processPrompt, stop])

  useEffect(() => {
    bus.current = new TransformerBus(room, 'projector')
    bus.current.on('run', ({ prompt, temperature, maxTokens }) => {
      if (typeof prompt !== 'string') return
      processPrompt(prompt, {
        temperature: typeof temperature === 'number' ? temperature : .7,
        maxTokens: typeof maxTokens === 'number' ? maxTokens : 3,
      }, false)
    })
    bus.current.on('clear', () => {
      stop()
      setRuns(generateTransformerSequence('Como uma decisão anterior influencia um novo caso?', { temperature: .7, maxTokens: 3 }))
      setIsDemo(true)
      setCycle(0)
      setStage(0)
    })
    bus.current.connect(setConnection)
    return () => { stop(); bus.current?.disconnect() }
  }, [processPrompt, room, stop])
  useEffect(() => { localStorage.setItem('transformer-theme', theme) }, [theme])
  const sampleRuns = useMemo(() => runs.length ? runs : generateTransformerSequence('Como um Transformer entende contexto?', { temperature: .7, maxTokens: 3 }), [runs])
  const sample = sampleRuns[Math.min(cycle, sampleRuns.length - 1)]
  const story = STAGE_STORIES[stage]
  const selectStage = useCallback((index: number) => { stop(); setStage(Math.max(0, Math.min(STAGES.length - 1, index))) }, [stop])
  const selectCycle = (index: number) => { stop(); setCycle(Math.max(0, Math.min(sampleRuns.length - 1, index))); setStage(0) }
  const previous = () => { stop(); if (stage > 0) setStage(stage - 1); else if (cycle > 0) { setCycle(cycle - 1); setStage(STAGES.length - 1) } }
  const next = () => { stop(); if (stage < STAGES.length - 1) setStage(stage + 1); else if (cycle < sampleRuns.length - 1) { setCycle(cycle + 1); setStage(0) } }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') previous()
      if (event.key === 'ArrowRight') next()
      if (event.key.toLocaleLowerCase('pt-BR') === 'r') setViewResetId((value) => value + 1)
      if (event.key.toLocaleLowerCase('pt-BR') === 'f') void document.documentElement.requestFullscreen()
      if (event.key === ' ') {
        event.preventDefault()
        if (isPlaying) stop()
        else processPrompt(sample.prompt, { temperature: sample.temperature, maxTokens: sampleRuns.length }, isDemo)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <main className={`display-page ${theme}`}>
      <TransformerScene run={sample} activeStage={stage} theme={theme} resetId={viewResetId} onSelectStage={selectStage} />
      <header className="display-header">
        <div><Brand compact /><span className="eyebrow">Transformer generativo · Sala {room}</span><h1>Como uma máquina constrói uma resposta?</h1></div>
        <div className="header-actions">
          <Connection state={connection} />
          <button className="icon-button" onClick={() => isPlaying ? stop() : processPrompt(sample.prompt, { temperature: sample.temperature, maxTokens: sampleRuns.length }, isDemo)} aria-label={isPlaying ? 'Pausar animação' : 'Reproduzir animação'}>{isPlaying ? <Pause /> : <Play />}</button>
          <button className="icon-button" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} aria-label="Alternar tema">{theme === 'dark' ? <Sun /> : <Moon />}</button>
          <button className="icon-button" onClick={() => setViewResetId((value) => value + 1)} aria-label="Restaurar câmera"><RotateCcw /></button>
          <button className="icon-button" onClick={() => void document.documentElement.requestFullscreen()} aria-label="Tela cheia"><Maximize /></button>
        </div>
      </header>
      <section className="prompt-card"><span>{isDemo ? 'Exemplo inicial' : 'Pergunta do aluno'}</span><p>{sample.prompt}</p><small>Grau de variação {sample.temperature.toFixed(1)} · {sampleRuns.length} palavra{sampleRuns.length > 1 ? 's' : ''}</small></section>
      <section className="explanation-panel" aria-live="polite">
        <div className="explanation-number">0{stage + 1}</div>
        <span className="eyebrow">{story.technical}</span>
        <h2>{story.title}</h2>
        <p>{story.explanation}</p>
        <div className="legal-example"><small>Exemplo para a leitura jurídica</small><p>{story.analogy}</p></div>
        <strong className="stage-evidence">{stageEvidence(sample, stage)}</strong>
        {stage === 7 && <p className="generated-sentence">{sample.generated}</p>}
      </section>
      <div className="scene-controls-hint">Arraste para girar <span>·</span> Roda ou pinça para aproximar <span>·</span> Clique em uma camada para explorar</div>
      <div className="cycle-bar"><span>Palavra em construção</span>{sampleRuns.map((item, index) => <button key={index} className={`${index < cycle ? 'done' : ''} ${index === cycle ? 'active' : ''}`} onClick={() => selectCycle(index)}><small>{index + 1}</small><strong>{item.selected}</strong></button>)}</div>
      <footer className="timeline">
        <div className="steps">{STAGES.map((label, index) => <button key={label} className={`${index < stage ? 'reached' : ''} ${index === stage ? 'current' : ''}`} onClick={() => selectStage(index)}><span>{index + 1}</span><b>{label}</b></button>)}</div>
        <div className="nav"><button onClick={previous} disabled={stage === 0 && cycle === 0}><ChevronLeft /></button><button onClick={next} disabled={stage === STAGES.length - 1 && cycle === sampleRuns.length - 1}><ChevronRight /></button><button onClick={() => processPrompt(sample.prompt, { temperature: sample.temperature, maxTokens: sampleRuns.length }, isDemo)}><RotateCcw size={17} /> Repetir</button></div>
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
