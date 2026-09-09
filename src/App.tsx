import { lazy, Suspense, useState } from 'react'
import { ArrowRight, Monitor, Radio, Send } from 'lucide-react'
import { AuthGate } from './AuthGate'
import { Brand } from './Brand'
import { sanitizeRoom } from './supabase'

const LabApp = lazy(() => import('./LabApp'))
const TeacherPage = lazy(() => import('./TeacherPage'))

function Loading() { return <main className="route-loading"><span className="eyebrow">Preparando laboratório</span><strong>Carregando…</strong></main> }

function Home({ room, setRoom }: { room: string; setRoom: (value: string) => void }) {
  return <main className="home-page"><section className="hero"><div><Brand/><span className="eyebrow">Laboratório de IA generativa</span><h1>Como uma máquina<br/><em>constrói uma resposta?</em></h1><p>Acompanhe tokens, vetores, atenção e probabilidades enquanto um Transformer didático processa linguagem.</p></div><div className="room-panel"><label>Sala<input value={room} onChange={(event) => setRoom(sanitizeRoom(event.target.value))}/></label><a className="route-card primary-card" href={`/display?room=${room}`}><Radio/><span><strong>Tela do projetor</strong><small>Visualização e condução da aula</small></span><ArrowRight/></a><a className="route-card" href={`/input?room=${room}`}><Send/><span><strong>Entrada do aluno</strong><small>Envio de prompts pelo tablet</small></span><ArrowRight/></a><a className="route-card" href={`/teacher?room=${room}`}><Monitor/><span><strong>Painel do professor</strong><small>QR Code e links da sala</small></span><ArrowRight/></a></div></section></main>
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  const params = new URLSearchParams(window.location.search)
  const [room, setRoomState] = useState(() => sanitizeRoom(params.get('room') || localStorage.getItem('transformer-room')))
  const setRoom = (value: string) => { setRoomState(value); localStorage.setItem('transformer-room', value) }
  const page = path === '/teacher' ? <TeacherPage room={room}/> : path === '/input' || path === '/display' ? <LabApp room={room}/> : <Home room={room} setRoom={setRoom}/>
  return <AuthGate brand={<Brand/>} labName="Transformer ao Vivo"><Suspense fallback={<Loading/>}>{page}</Suspense></AuthGate>
}
