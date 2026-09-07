import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  ArrowRight, ChevronLeft, ChevronRight, Eraser, LogIn, LogOut, Maximize,
  Eye, Moon, Pause, Play, Radio, RotateCcw, Send, Sun, X,
} from 'lucide-react'
import { getSupabaseClient, sanitizeRoom, TransformerBus, type ConnectionState } from './supabase'
import {
  generateTransformerSequence, STAGES, tokenizeForClassroom, type GenerationOptions, type TransformerRun,
} from './transformer'
import { TransformerScene } from './TransformerScene'
import { requestGeneration, type GenerationTrace } from './model'

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

function visibleToken(token = '') {
  return token.replace(/ /g, '·').replace(/\n/g, '↵') || '∅'
}

function stageEvidence(run: TransformerRun, stage: number, tokenIndex: number) {
  const token = run.tokens[tokenIndex] || ''
  if (stage === 0) return `${run.totalTokenCount} tokens identificados no texto`
  if (stage === 1) return `Cada parte virou um conjunto de 12 números`
  if (stage === 2) return `“${visibleToken(token)}” ocupa a posição ${tokenIndex + 1}`
  if (stage === 3) {
    const weights = run.attention[0]?.[tokenIndex] || []
    const strongest = weights.reduce((best, value, index) => value > best.value ? { value, index } : best, { value: -1, index: 0 })
    return `“${visibleToken(token)}” consultou mais “${visibleToken(run.tokens[strongest.index])}”`
  }
  if (stage === 4) return 'A informação inicial foi mantida junto das novas relações'
  if (stage === 5) return 'A representação foi ampliada, revisada e condensada novamente'
  if (stage === 6) return run.candidates.slice(0, 3).map((candidate) => `${candidate.token} ${Math.round(candidate.probability * 100)}%`).join(' · ')
  return `Palavra escolhida: “${run.selected}”`
}

function VectorPreview({ values, label }: { values: number[]; label: string }) {
  return <div className="vector-preview"><small>{label}</small><code>[{values.slice(0, 5).map((value) => value.toFixed(2)).join(', ')} …]</code></div>
}

function CalculationDesk({ run, stage, tokenIndex }: { run: TransformerRun; stage: number; tokenIndex: number }) {
  const token = run.tokens[tokenIndex] || ''
  const id = run.tokenIds[tokenIndex] || 0
  const attention = run.attention[0]?.[tokenIndex] || []
  const relations = attention.map((value, index) => ({ value, index })).filter(({ index }) => index <= tokenIndex).sort((a, b) => b.value - a.value).slice(0, 3)
  const neuron = run.neuronCalculations[tokenIndex]
  return (
    <div className="calculation-desk">
      <div className="calculation-title"><span>Seguindo este token</span><strong>“{visibleToken(token)}”</strong></div>
      {stage === 0 && <div className="plain-calculation"><code>{visibleToken(token)}</code><ArrowRight size={14} /><code>ID {id}</code><p>O texto foi cortado em partes reconhecidas pelo vocabulário do modelo.</p></div>}
      {stage === 1 && neuron && <div className="neuron-math">
        <div className="math-terms">{neuron.inputs.map((input, index) => <span key={neuron.labels[index]}><small>{neuron.labels[index]}</small><code>{input.toFixed(2)} × {neuron.weights[index].toFixed(2)} = {neuron.products[index].toFixed(2)}</code></span>)}</div>
        <div className="math-result"><code>soma + viés {neuron.bias.toFixed(2)} = {neuron.sum.toFixed(3)}</code><ArrowRight size={14} /><strong>tanh = {neuron.activation.toFixed(3)}</strong></div>
        <VectorPreview label="12 neurônios calculados · primeiras 5 saídas" values={run.embeddings[tokenIndex] || []} />
      </div>}
      {stage === 2 && <><div className="plain-calculation"><span>representação</span><strong>+</strong><span>posição {tokenIndex + 1}</span><strong>=</strong><span>ordem registrada</span></div><VectorPreview label="depois de marcar a posição" values={run.positioned[tokenIndex] || []} /></>}
      {stage === 3 && <div className="relation-list">{relations.map(({ value, index }) => <div key={index}><span>“{visibleToken(run.tokens[index])}”</span><i><b style={{ width: `${Math.max(3, value * 100)}%` }} /></i><strong>{Math.round(value * 100)}%</strong></div>)}</div>}
      {stage === 4 && <div className="vector-pair"><VectorPreview label="antes: ordem + significado" values={run.positioned[tokenIndex] || []} /><ArrowRight size={15} /><VectorPreview label="depois: texto + relações preservados" values={run.residual[tokenIndex] || []} /></div>}
      {stage === 5 && <div className="vector-pair"><VectorPreview label="antes da revisão" values={run.residual[tokenIndex] || []} /><ArrowRight size={15} /><VectorPreview label="depois da revisão" values={run.feedForward[tokenIndex] || []} /></div>}
      {stage === 6 && <><div className="softmax-note"><code>softmax(pontuações)</code><span>transforma valores em probabilidades comparáveis</span></div><div className="candidate-list">{run.candidates.slice(0, 4).map((candidate) => <div key={candidate.token}><span>“{candidate.token}” <small>nota {candidate.logit.toFixed(2)}</small></span><i><b style={{ width: `${Math.max(3, candidate.probability * 100)}%` }} /></i><strong>{Math.round(candidate.probability * 100)}%</strong></div>)}</div></>}
      {stage === 7 && <div className="chosen-token"><span>Próxima parte escolhida</span><strong>“{run.selected}”</strong><small>ID {run.selectedId} · agora o processo recomeça</small></div>}
    </div>
  )
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
  const [maxTokens, setMaxTokens] = useState(12)
  const [sent, setSent] = useState(false)
  const promptTokens = useMemo(() => tokenizeForClassroom(prompt), [prompt])
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
        <textarea maxLength={140} value={prompt} onChange={(event) => { setPrompt(event.target.value); setSent(false) }} placeholder="Digite uma pergunta…" />
        <div className="input-count"><small>{promptTokens.total} tokens{promptTokens.total > 24 ? ' · os 24 mais recentes serão demonstrados' : ''}</small><small>{prompt.length}/140 caracteres</small></div>
        <div className="generation-settings">
          <label><span>Liberdade de escolha <strong>{temperature.toFixed(1)}</strong></span><input type="range" min="0.2" max="1.4" step="0.1" value={temperature} onChange={(event) => { setTemperature(Number(event.target.value)); setSent(false) }} /><small>Mais previsível</small><small>Mais variada</small></label>
          <fieldset><legend>Tamanho da resposta</legend>{[8, 10, 12].map((value) => <button key={value} type="button" className={maxTokens === value ? 'active' : ''} onClick={() => { setMaxTokens(value); setSent(false) }}>{value}</button>)}</fieldset>
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
  const [stage, setStage] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isDemo, setIsDemo] = useState(true)
  const [focusToken, setFocusToken] = useState<number | null>(null)
  const [awaitingChoice, setAwaitingChoice] = useState(true)
  const [flowComplete, setFlowComplete] = useState(false)
  const [trace, setTrace] = useState<GenerationTrace | null>(null)
  const [traceState, setTraceState] = useState<'idle' | 'loading' | 'model' | 'fallback'>('idle')
  const [resultOpen, setResultOpen] = useState(false)
  const [selectedOutput, setSelectedOutput] = useState(0)
  const [viewResetId, setViewResetId] = useState(0)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('transformer-theme') === 'light' ? 'light' : 'dark')

  const stop = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
    setIsPlaying(false)
  }, [])

  const preparePrompt = useCallback((prompt: string, options: GenerationOptions = { temperature: .7, maxTokens: 12 }, demo = false) => {
    stop()
    setRuns(generateTransformerSequence(prompt, options))
    setIsDemo(demo)
    setStage(0)
    setFocusToken(null)
    setAwaitingChoice(true)
    setFlowComplete(false)
    setResultOpen(false)
    setSelectedOutput(0)
    setTrace(null)
    setTraceState(demo ? 'fallback' : 'loading')
    if (!demo) void requestGeneration(prompt, options.temperature).then((result) => {
      setTrace(result)
      setTraceState('model')
    }).catch(() => setTraceState('fallback'))
  }, [stop])

  const startJourney = useCallback((fromStage = 0) => {
    stop()
    setAwaitingChoice(false)
    setFlowComplete(false)
    setStage(fromStage)
    setIsPlaying(true)
    let current = fromStage
    timer.current = window.setInterval(() => {
      if (current < STAGES.length - 1) {
        current += 1
        setStage(current)
      } else {
        stop()
        setFlowComplete(true)
      }
    }, 1450)
  }, [stop])

  useEffect(() => {
    preparePrompt('Como uma decisão anterior influencia um novo caso?', { temperature: .7, maxTokens: 12 }, true)
    return stop
  }, [preparePrompt, stop])

  useEffect(() => {
    bus.current = new TransformerBus(room, 'projector')
    bus.current.on('run', ({ prompt, temperature, maxTokens }) => {
      if (typeof prompt !== 'string') return
      preparePrompt(prompt, {
        temperature: typeof temperature === 'number' ? temperature : .7,
        maxTokens: typeof maxTokens === 'number' ? Math.max(12, maxTokens) : 12,
      }, false)
    })
    bus.current.on('clear', () => preparePrompt('Como uma decisão anterior influencia um novo caso?', { temperature: .7, maxTokens: 12 }, true))
    bus.current.connect(setConnection)
    return () => { stop(); bus.current?.disconnect() }
  }, [preparePrompt, room, stop])

  useEffect(() => { localStorage.setItem('transformer-theme', theme) }, [theme])
  const sampleRuns = useMemo(() => runs.length ? runs : generateTransformerSequence('Como um Transformer entende contexto?', { temperature: .7, maxTokens: 12 }), [runs])
  const sample = sampleRuns[0]
  const story = STAGE_STORIES[stage]
  const activeTokenIndex = Math.max(0, Math.min(focusToken ?? sample.tokens.length - 1, sample.tokens.length - 1))
  const chooseToken = (index: number) => {
    stop()
    setFocusToken(index)
    setStage(0)
    setAwaitingChoice(true)
    setFlowComplete(false)
  }
  const selectStage = useCallback((index: number) => {
    if (awaitingChoice || (!flowComplete && index > stage)) return
    stop()
    setStage(Math.max(0, Math.min(STAGES.length - 1, index)))
  }, [awaitingChoice, flowComplete, stage, stop])
  const previous = () => { stop(); if (stage > 0) setStage(stage - 1) }
  const next = () => {
    if (awaitingChoice) return
    stop()
    if (stage < STAGES.length - 1) setStage(stage + 1)
    else setFlowComplete(true)
  }

  const outputTokens = useMemo(() => trace?.outputTokens.length ? trace.outputTokens : sampleRuns.map((run) => {
    const chosen = run.candidates.find((candidate) => candidate.token === run.selected) || run.candidates[0]
    return {
      text: run.selected,
      logprob: Math.log(chosen?.probability || 1e-9),
      probability: chosen?.probability || 0,
      alternatives: run.candidates.filter((candidate) => candidate.token !== run.selected).slice(0, 5).map((candidate) => ({ text: candidate.token, logprob: Math.log(candidate.probability || 1e-9), probability: candidate.probability })),
    }
  }), [sampleRuns, trace])
  const finalText = trace?.finalText || outputTokens.map((token, index) => token.text === '.' ? '.' : `${index ? ' ' : ''}${token.text}`).join('')
  const inspectedOutput = outputTokens[Math.min(selectedOutput, outputTokens.length - 1)]

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') previous()
      if (event.key === 'ArrowRight') next()
      if (event.key.toLocaleLowerCase('pt-BR') === 'r') setViewResetId((value) => value + 1)
      if (event.key.toLocaleLowerCase('pt-BR') === 'f') void document.documentElement.requestFullscreen()
      if (event.key === ' ' && !awaitingChoice) { event.preventDefault(); isPlaying ? stop() : startJourney(stage) }
      if (event.key === 'Escape') setResultOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <main className={`display-page ${theme}`}>
      <TransformerScene run={sample} activeStage={stage} selectedTokenIndex={activeTokenIndex} theme={theme} resetId={viewResetId} onSelectStage={selectStage} />
      <header className="display-header">
        <div><Brand compact /><span className="eyebrow">Transformer generativo · Sala {room}</span><h1>Como uma máquina constrói uma resposta?</h1></div>
        <div className="header-actions"><a className="tablet-link" href={`/input?room=${room}`} target="_blank" rel="noreferrer"><Send size={15} /> Tela do aluno</a><Connection state={connection} /><button className="icon-button" disabled={awaitingChoice} onClick={() => isPlaying ? stop() : startJourney(stage)} aria-label={isPlaying ? 'Pausar animação' : 'Reproduzir animação'}>{isPlaying ? <Pause /> : <Play />}</button><button className="icon-button" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} aria-label="Alternar tema">{theme === 'dark' ? <Sun /> : <Moon />}</button><button className="icon-button" onClick={() => setViewResetId((value) => value + 1)} aria-label="Restaurar câmera"><RotateCcw /></button><button className="icon-button" onClick={() => void document.documentElement.requestFullscreen()} aria-label="Tela cheia"><Maximize /></button></div>
      </header>

      <section className="token-column" aria-label="Tokens reais do texto">
        <span className="eyebrow">{isDemo ? 'Exemplo inicial' : 'Texto do aluno'}</span>
        <p>{sample.prompt}</p>
        <div className="token-column-heading"><strong>Escolha uma parte para acompanhar</strong><small>BPE o200k_base · {sample.totalTokenCount} tokens</small></div>
        <div className="token-list">{sample.tokens.map((token, index) => <button key={`${index}-${sample.tokenIds[index]}`} className={index === activeTokenIndex ? 'active' : ''} onClick={() => chooseToken(index)}><span>{visibleToken(token)}</span><small>ID {sample.tokenIds[index]}</small></button>)}</div>
        {awaitingChoice && <button className="follow-button" onClick={() => startJourney(0)}><Play size={15} /> Acompanhar “{visibleToken(sample.tokens[activeTokenIndex])}”</button>}
        {flowComplete && <button className="follow-button secondary-follow" onClick={() => { setAwaitingChoice(true); setStage(0) }}><RotateCcw size={15} /> Escolher outro token</button>}
        <div className="scene-controls-hint">Arraste para girar · Roda ou pinça para aproximar</div>
      </section>

      <section className="stage-progress-top">
        <div className="stage-transform"><small>Token acompanhado</small><strong>“{visibleToken(sample.tokens[activeTokenIndex])}”</strong><ArrowRight size={16} /><span>{story.title}</span></div>
        <div className="steps">{STAGES.map((label, index) => <button key={label} className={`${index < stage ? 'reached' : ''} ${index === stage ? 'current' : ''}`} onClick={() => selectStage(index)}><span>{index + 1}</span><b>{label}</b></button>)}</div>
      </section>

      <section className="explanation-panel" aria-live="polite">
        <div className="explanation-number">0{stage + 1}</div><span className="eyebrow">{story.technical}</span><h2>{story.title}</h2><p>{story.explanation}</p>
        <div className="legal-example"><small>Exemplo para a leitura jurídica</small><p>{story.analogy}</p></div>
        <strong className="stage-evidence">{stageEvidence(sample, stage, activeTokenIndex)}</strong>
        <CalculationDesk run={sample} stage={stage} tokenIndex={activeTokenIndex} />
      </section>

      <footer className="timeline"><div className="flow-status">{awaitingChoice ? 'Escolha e confirme um token' : flowComplete ? 'Percurso concluído' : `Etapa ${stage + 1} de 8`}</div><div className="nav"><button onClick={previous} disabled={awaitingChoice || stage === 0}><ChevronLeft /></button><button onClick={next} disabled={awaitingChoice || (flowComplete && stage === 7)}><ChevronRight /></button><button className="reveal-button" disabled={!flowComplete} onClick={() => setResultOpen(true)}><Eye size={17} /> {traceState === 'loading' ? 'Preparando resposta' : 'Revelar resposta'}</button></div></footer>

      {resultOpen && <div className="result-modal" role="dialog" aria-modal="true" aria-label="Resposta gerada"><div className="result-dialog"><button className="close-result" onClick={() => setResultOpen(false)} aria-label="Fechar"><X /></button><span className="eyebrow">{traceState === 'model' ? `Resultado real · ${trace?.model}` : 'Resultado do modelo didático'}</span><h2>A resposta foi construída</h2><p className="final-answer">{finalText}</p><div className="output-token-list">{outputTokens.map((token, index) => <button key={`${index}-${token.text}`} className={selectedOutput === index ? 'active' : ''} onClick={() => setSelectedOutput(index)}>{visibleToken(token.text)}</button>)}</div>{inspectedOutput && <div className="probability-inspector"><div><small>Token escolhido</small><strong>“{visibleToken(inspectedOutput.text)}”</strong><b>{(inspectedOutput.probability * 100).toFixed(1)}%</b></div><span>Concorreu com</span>{inspectedOutput.alternatives.slice(0, 5).map((alternative, index) => <div className="probability-row" key={`${index}-${alternative.text}`}><span>“{visibleToken(alternative.text)}”</span><i><b style={{ width: `${Math.max(2, alternative.probability * 100)}%` }} /></i><strong>{(alternative.probability * 100).toFixed(1)}%</strong></div>)}</div>}<small className="result-source">{traceState === 'model' ? 'Probabilidades informadas pelo modelo via LangChain.' : 'Probabilidades calculadas pelo mini-Transformer determinístico.'}</small></div></div>}
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
