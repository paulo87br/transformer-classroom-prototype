import { createClient } from '@supabase/supabase-js'
import { ChatOpenAI } from '@langchain/openai'

type RequestLike = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
type ResponseLike = { status: (code: number) => ResponseLike; json: (body: unknown) => void }

function textContent(content: unknown) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((part) => typeof part === 'object' && part && 'text' in part ? String(part.text) : '').join('')
  return String(content || '')
}

export default async function handler(request: RequestLike, response: ResponseLike) {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Método não permitido' })
  const authorization = Array.isArray(request.headers.authorization) ? request.headers.authorization[0] : request.headers.authorization
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return response.status(401).json({ error: 'Sessão ausente' })

  const supabaseUrl = process.env.SUPABASE_URL
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !publishableKey) return response.status(503).json({ error: 'Supabase não configurado' })
  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData.user) return response.status(401).json({ error: 'Sessão inválida' })
  const { data: isAdmin, error: accessError } = await supabase.rpc('pulso_is_admin')
  if (accessError || isAdmin !== true) return response.status(403).json({ error: 'Acesso não autorizado' })

  const provider = process.env.AI_PROVIDER || 'openai'
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY
  if (!apiKey) return response.status(503).json({ error: 'Provedor de IA ainda não configurado' })
  const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body as { prompt?: unknown; temperature?: unknown }
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 140) : ''
  if (!prompt) return response.status(400).json({ error: 'Texto vazio' })
  const temperature = typeof body.temperature === 'number' ? Math.max(.2, Math.min(1.2, body.temperature)) : .7
  const modelName = process.env.AI_MODEL || 'gpt-4o-mini'

  try {
    const model = new ChatOpenAI({
      apiKey, model: modelName, temperature, maxTokens: 60, logprobs: true, topLogprobs: 5,
      configuration: process.env.AI_BASE_URL ? { baseURL: process.env.AI_BASE_URL } : undefined,
    })
    const message = await model.invoke([
      { role: 'system', content: 'Responda em português do Brasil, em uma única frase clara de no máximo 18 palavras. Não use listas.' },
      { role: 'user', content: prompt },
    ])
    const metadata = message.response_metadata as Record<string, any>
    const rawTokens = metadata.logprobs?.content || []
    const outputTokens = rawTokens.map((item: any) => ({
      text: String(item.token || ''),
      logprob: Number(item.logprob || 0),
      probability: Math.exp(Number(item.logprob || 0)),
      alternatives: (item.top_logprobs || []).filter((alternative: any) => alternative.token !== item.token).map((alternative: any) => ({
        text: String(alternative.token || ''),
        logprob: Number(alternative.logprob || 0),
        probability: Math.exp(Number(alternative.logprob || 0)),
      })),
    }))
    const usage = message.usage_metadata as { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined
    return response.status(200).json({
      source: 'model', provider, model: modelName,
      finalText: textContent(message.content), outputTokens,
      usage: { inputTokens: usage?.input_tokens || 0, outputTokens: usage?.output_tokens || 0, totalTokens: usage?.total_tokens || 0 },
    })
  } catch (error) {
    console.error('generation_failed', error instanceof Error ? error.message : error)
    return response.status(502).json({ error: 'O modelo não conseguiu gerar a demonstração' })
  }
}
