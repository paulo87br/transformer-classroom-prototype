import { getSupabaseClient } from './supabase'

export type ModelAlternative = { text: string; logprob: number; probability: number }
export type ModelOutputToken = { text: string; logprob: number; probability: number; alternatives: ModelAlternative[] }
export type GenerationTrace = {
  source: 'model'
  provider: string
  model: string
  finalText: string
  outputTokens: ModelOutputToken[]
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

export async function requestGeneration(prompt: string, temperature: number) {
  const client = getSupabaseClient()
  const { data } = await client?.auth.getSession() || { data: { session: null } }
  if (!data.session) throw new Error('Sessão não encontrada')
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ prompt, temperature }),
  })
  const payload = await response.json() as GenerationTrace & { error?: string }
  if (!response.ok) throw new Error(payload.error || 'Modelo indisponível')
  return payload
}
