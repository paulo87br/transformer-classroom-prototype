import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, Copy, ExternalLink, Monitor, Send } from 'lucide-react'
import QRCode from 'qrcode'
import { Brand } from './Brand'

function LinkCard({ label, description, href, icon }: { label: string; description: string; href: string; icon: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => { await navigator.clipboard.writeText(href); setCopied(true); window.setTimeout(() => setCopied(false), 1600) }
  return <article className="teacher-link-card"><div>{icon}<span><strong>{label}</strong><small>{description}</small></span></div><code>{href}</code><div className="teacher-link-actions"><button className="button secondary" onClick={() => void copy()}>{copied ? <Check/> : <Copy/>}{copied ? 'Copiado' : 'Copiar link'}</button><a className="button primary" href={href} target="_blank" rel="noreferrer"><ExternalLink/>Abrir</a></div></article>
}

export default function TeacherPage({ room }: { room: string }) {
  const [qr, setQr] = useState('')
  const origin = window.location.origin
  const participantUrl = useMemo(() => `${origin}/input?room=${encodeURIComponent(room)}`, [origin, room])
  const displayUrl = useMemo(() => `${origin}/display?room=${encodeURIComponent(room)}`, [origin, room])
  useEffect(() => { void QRCode.toDataURL(participantUrl, { width: 420, margin: 2, color: { dark: '#0a0c10', light: '#f4f0e8' }, errorCorrectionLevel: 'M' }).then(setQr) }, [participantUrl])
  return <main className="teacher-page"><header><Brand compact/><a href="/">Voltar ao início</a></header><section className="teacher-hero"><div><span className="eyebrow">Painel do professor · Sala {room}</span><h1>Prepare a aula<br/><em>em duas telas.</em></h1><p>Projete a visualização e compartilhe o QR Code com os participantes. Todos entram na mesma sala automaticamente.</p></div><div className="teacher-qr"><span>Entrada dos participantes</span>{qr ? <img src={qr} alt={`QR Code para entrar na sala ${room}`}/> : <div className="qr-placeholder"/>}<strong>{room}</strong><small>Aponte a câmera do tablet</small></div></section><section className="teacher-links"><LinkCard label="Tela do projetor" description="Abra no computador conectado à projeção" href={displayUrl} icon={<Monitor/>}/><LinkCard label="Tela do participante" description="Compartilhe no tablet ou pelo QR Code" href={participantUrl} icon={<Send/>}/></section></main>
}
