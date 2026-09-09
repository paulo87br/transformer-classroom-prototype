import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LogIn, LogOut, RotateCcw } from 'lucide-react'
import { getSupabaseClient, initializeSupabaseClient } from './supabase'

type AuthState =
  | 'booting'
  | 'anonymous'
  | 'authenticating'
  | 'authenticated'
  | 'unauthorized'
  | 'verification-error'
  | 'configuration-error'

type AuthGateProps = {
  brand: ReactNode
  children: ReactNode
  labName: string
}

export function AuthGate({ brand, children, labName }: AuthGateProps) {
  const [state, setState] = useState<AuthState>('booting')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accountEmail, setAccountEmail] = useState('')
  const [error, setError] = useState('')
  const [client, setClient] = useState(() => getSupabaseClient())
  const [configurationResolved, setConfigurationResolved] = useState(Boolean(client))
  const stateRef = useRef<AuthState>('booting')
  const mountedRef = useRef(true)
  const authorizedUserIdRef = useRef<string | null>(null)
  const pendingUserIdRef = useRef<string | null>(null)

  const transition = useCallback((next: AuthState) => {
    stateRef.current = next
    if (mountedRef.current) setState(next)
  }, [])

  useEffect(() => {
    if (client) return
    let active = true
    void initializeSupabaseClient().then((configuredClient) => {
      if (!active) return
      setClient(configuredClient)
      setConfigurationResolved(true)
    })
    return () => { active = false }
  }, [client])

  const verifyAccess = useCallback(async (session: Session, mode: 'restore' | 'sign-in' = 'restore') => {
    if (!client) return
    const userId = session.user.id
    setAccountEmail(session.user.email || '')

    if (authorizedUserIdRef.current === userId) {
      if (stateRef.current !== 'authenticated') transition('authenticated')
      return
    }
    if (pendingUserIdRef.current === userId) return

    const replacingUser = Boolean(authorizedUserIdRef.current && authorizedUserIdRef.current !== userId)
    if (stateRef.current !== 'authenticated' || replacingUser) {
      transition(mode === 'sign-in' ? 'authenticating' : 'booting')
    }

    pendingUserIdRef.current = userId
    const { data: isAdmin, error: accessError } = await client.rpc('pulso_is_admin')
    if (!mountedRef.current || pendingUserIdRef.current !== userId) return
    pendingUserIdRef.current = null

    if (accessError) {
      setError('Não foi possível validar o acesso. Verifique a conexão e tente novamente.')
      if (stateRef.current !== 'authenticated' || replacingUser) transition('verification-error')
      return
    }
    if (isAdmin === true) {
      authorizedUserIdRef.current = userId
      setError('')
      transition('authenticated')
      return
    }
    authorizedUserIdRef.current = null
    transition('unauthorized')
  }, [client, transition])

  useEffect(() => {
    mountedRef.current = true
    if (!configurationResolved) return () => { mountedRef.current = false }
    if (!client) {
      transition('configuration-error')
      return () => { mountedRef.current = false }
    }

    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (!mountedRef.current) return
        if (event === 'SIGNED_OUT') {
          authorizedUserIdRef.current = null
          pendingUserIdRef.current = null
          transition('anonymous')
          return
        }
        if (!session) {
          if (event === 'INITIAL_SESSION' && stateRef.current === 'booting') transition('anonymous')
          return
        }
        if (event === 'TOKEN_REFRESHED' && authorizedUserIdRef.current === session.user.id) return
        void verifyAccess(session)
      }, 0)
    })

    void client.auth.getSession().then(({ data: { session }, error: sessionError }) => {
      if (!mountedRef.current) return
      if (sessionError) {
        setError('Não foi possível restaurar a sessão. Verifique a conexão e tente novamente.')
        if (stateRef.current !== 'authenticated') transition('verification-error')
        return
      }
      if (session) void verifyAccess(session)
      else if (stateRef.current === 'booting') transition('anonymous')
    })

    return () => {
      mountedRef.current = false
      listener.subscription.unsubscribe()
    }
  }, [client, configurationResolved, transition, verifyAccess])

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!client || state === 'authenticating') return
    setError('')
    transition('authenticating')
    const { data, error: signInError } = await client.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (signInError) {
      setError('E-mail ou senha incorretos.')
      transition('anonymous')
      return
    }
    if (data.session) await verifyAccess(data.session, 'sign-in')
  }

  const signOut = async () => {
    if (!client) return
    await client.auth.signOut()
    authorizedUserIdRef.current = null
    pendingUserIdRef.current = null
    setPassword('')
    transition('anonymous')
  }

  const retrySession = async () => {
    if (!client) return
    setError('')
    transition('booting')
    const { data: { session }, error: sessionError } = await client.auth.getSession()
    if (sessionError) {
      setError('Não foi possível restaurar a sessão. Verifique a conexão e tente novamente.')
      transition('verification-error')
      return
    }
    if (!session) {
      transition('anonymous')
      return
    }
    await verifyAccess(session)
  }

  if (state === 'authenticated') {
    const path = window.location.pathname.replace(/\/+$/, '') || '/'
    const showSignOut = !['/display', '/input'].includes(path)
    return (
      <>
        {children}
        {showSignOut && <button className="signout" onClick={() => void signOut()}><LogOut size={15} /> Sair</button>}
      </>
    )
  }

  const title =
    state === 'booting' ? 'Retomando sessão'
      : state === 'authenticating' ? 'Verificando acesso'
        : state === 'unauthorized' ? 'Conta sem acesso'
          : state === 'verification-error' ? 'Conexão interrompida'
            : 'Entrar'

  return (
    <main className="auth-page">
      <section className="auth-shell">
        {brand}
        <span className="eyebrow">{labName}</span>
        <h1>{title}</h1>
        {state === 'booting' || state === 'authenticating' ? (
          <div className="loading"><i /> {state === 'booting' ? 'Restaurando seu acesso…' : 'Validando credenciais…'}</div>
        ) : state === 'configuration-error' ? (
          <p className="form-error">A conexão com o Supabase não está configurada nesta implantação.</p>
        ) : state === 'verification-error' ? (
          <div className="auth-form">
            <p className="form-error" role="alert">{error}</p>
            <button className="button secondary" type="button" onClick={() => void retrySession()}><RotateCcw size={18} /> Tentar novamente</button>
          </div>
        ) : state === 'unauthorized' ? (
          <div className="auth-form">
            <p className="form-error"><strong>{accountEmail}</strong> não pertence à lista de administradores.</p>
            <button className="button secondary" type="button" onClick={() => void signOut()}><LogOut size={18} /> Usar outra conta</button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={(event) => void signIn(event)}>
            <label>E-mail<input type="email" autoComplete="username" autoFocus required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button primary" type="submit"><LogIn size={18} /> Entrar</button>
          </form>
        )}
      </section>
    </main>
  )
}

