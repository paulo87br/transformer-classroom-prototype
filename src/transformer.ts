import { decode, encode } from 'gpt-tokenizer'

export const STAGES = [
  'Separar',
  'Representar',
  'Ordenar',
  'Relacionar',
  'Preservar',
  'Refinar',
  'Comparar',
  'Continuar',
] as const

export type Candidate = { token: string; tokenId: number; probability: number }
export type ClassroomToken = { id: number; text: string; display: string }
export type GenerationOptions = { temperature: number; maxTokens: number }

export type TransformerRun = {
  prompt: string
  context: string
  cycle: number
  temperature: number
  tokens: string[]
  tokenIds: number[]
  totalTokenCount: number
  contextTruncated: boolean
  embeddings: number[][]
  positioned: number[][]
  attention: number[][][]
  residual: number[][]
  feedForward: number[][]
  candidates: Candidate[]
  selected: string
  selectedId: number
  generated: string
}

const DIMENSION = 12
const HEADS = 3
const HEAD_DIMENSION = DIMENSION / HEADS
const CANDIDATES = [
  'é', 'porque', 'quando', 'um', 'uma', 'modelo', 'rede', 'atenção', 'tokens', 'contexto',
  'aprende', 'relaciona', 'transforma', 'gera', 'resposta', 'informação', 'de', 'com', 'e', '.',
]

function hash(text: string) {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

function random(seed: number) {
  let state = seed || 1
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state)
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state)
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296
  }
}

function tokenVector(token: string | number) {
  const next = random(hash(String(token).toLocaleLowerCase('pt-BR')))
  return Array.from({ length: DIMENSION }, () => next() * 2 - 1)
}

function projection(input: number[], size: number, seed: number) {
  const next = random(seed)
  return Array.from({ length: size }, () => {
    let sum = 0
    for (let index = 0; index < input.length; index += 1) sum += input[index] * (next() * 0.8 - 0.4)
    return sum
  })
}

function softmax(values: number[]) {
  const max = Math.max(...values)
  const exp = values.map((value) => Math.exp(value - max))
  const total = exp.reduce((sum, value) => sum + value, 0) || 1
  return exp.map((value) => value / total)
}

function normalize(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  const deviation = Math.sqrt(variance + 1e-5)
  return values.map((value) => (value - mean) / deviation)
}

export function tokenizeForClassroom(context: string, limit = 24) {
  const allIds = encode(context)
  const ids = allIds.slice(-limit)
  const tokens: ClassroomToken[] = ids.map((id) => {
    const text = decode([id])
    return { id, text, display: text.replace(/ /g, '·').replace(/\n/g, '↵') || '∅' }
  })
  return { tokens, total: allIds.length, truncated: allIds.length > ids.length }
}

function keywordBias(context: string, candidate: string) {
  const text = context.toLocaleLowerCase('pt-BR')
  const last = context.toLocaleLowerCase('pt-BR').match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)?.at(-1) || ''
  let bias = 0
  if (/^(o que|como|por que|qual)/.test(text) && candidate === 'é') bias += 1.2
  if (/(rede|modelo|máquina|ia)/.test(text) && candidate === 'aprende') bias += 1.35
  if (/(transformer|atenção|token)/.test(text) && candidate === 'relaciona') bias += 1.5
  if (/(texto|resposta|linguagem)/.test(text) && candidate === 'gera') bias += 1.25
  if (/^(é|porque|quando|com|de|e)$/.test(last) && /^(um|uma|modelo|rede|atenção|tokens|contexto|informação)$/.test(candidate)) bias += 1.15
  if (/^(modelo|rede|atenção|tokens|contexto|informação)$/.test(last) && /^(aprende|relaciona|transforma|gera|é)$/.test(candidate)) bias += 1.05
  if (/^(aprende|relaciona|transforma|gera)$/.test(last) && /^(contexto|tokens|informação|resposta)$/.test(candidate)) bias += 1.1
  if (last === '.' && candidate === 'quando') bias += 1
  return bias
}

function appendToken(context: string, token: string) {
  return token === '.' ? `${context.trim()}.` : `${context.trim()} ${token}`
}

function selectCandidate(candidates: Candidate[], seed: number) {
  const value = random(seed)()
  let cumulative = 0
  for (const candidate of candidates) {
    cumulative += candidate.probability
    if (value <= cumulative) return candidate
  }
  return candidates.at(-1) || { token: '', tokenId: 0, probability: 0 }
}

export function runTinyTransformer(
  context: string,
  options: Partial<GenerationOptions> & { cycle?: number; originalPrompt?: string } = {},
): TransformerRun {
  const temperature = Math.max(0.2, Math.min(1.4, options.temperature ?? 0.7))
  const cycle = Math.max(0, options.cycle ?? 0)
  const prompt = options.originalPrompt || context
  const tokenization = tokenizeForClassroom(context)
  const tokens = tokenization.tokens.map((token) => token.text)
  const tokenIds = tokenization.tokens.map((token) => token.id)
  const embeddings = tokenIds.map(tokenVector)
  const positioned = embeddings.map((vector, position) => vector.map((value, dimension) => {
    const frequency = 1 / (10000 ** (2 * Math.floor(dimension / 2) / DIMENSION))
    const positionSignal = dimension % 2 === 0 ? Math.sin(position * frequency) : Math.cos(position * frequency)
    return value + positionSignal
  }))

  const attention: number[][][] = []
  const mergedContexts = positioned.map(() => [] as number[])

  for (let head = 0; head < HEADS; head += 1) {
    const queries = positioned.map((vector) => projection(vector, HEAD_DIMENSION, 1103 + head * 97))
    const keys = positioned.map((vector) => projection(vector, HEAD_DIMENSION, 2203 + head * 101))
    const values = positioned.map((vector) => projection(vector, HEAD_DIMENSION, 3301 + head * 103))
    const headAttention: number[][] = []

    for (let queryIndex = 0; queryIndex < tokens.length; queryIndex += 1) {
      const scores = tokens.map((_, keyIndex) => {
        if (keyIndex > queryIndex) return -1e9
        return queries[queryIndex].reduce((sum, value, dimension) => sum + value * keys[keyIndex][dimension], 0) / Math.sqrt(HEAD_DIMENSION)
      })
      const weights = softmax(scores)
      headAttention.push(weights)
      const headContext = Array.from({ length: HEAD_DIMENSION }, (_, dimension) => (
        weights.reduce((sum, weight, keyIndex) => sum + weight * values[keyIndex][dimension], 0)
      ))
      mergedContexts[queryIndex].push(...headContext)
    }
    attention.push(headAttention)
  }

  const residual = positioned.map((vector, tokenIndex) => normalize(
    vector.map((value, dimension) => value + mergedContexts[tokenIndex][dimension]),
  ))

  const feedForward = residual.map((vector, tokenIndex) => {
    const expanded = projection(vector, DIMENSION * 2, 4409 + tokenIndex).map((value) => Math.max(0, value))
    const compressed = projection(expanded, DIMENSION, 5501 + tokenIndex)
    return normalize(vector.map((value, dimension) => value + compressed[dimension]))
  })

  const last = feedForward.at(-1) || Array(DIMENSION).fill(0)
  const candidateIds = CANDIDATES.map((candidate) => encode(candidate === '.' ? candidate : ` ${candidate}`)[0] || hash(candidate))
  const logits = CANDIDATES.map((candidate, candidateIndex) => {
    const outputVector = tokenVector(candidateIds[candidateIndex])
    const score = last.reduce((sum, value, index) => sum + value * outputVector[index], 0) / Math.sqrt(DIMENSION)
    return (score + keywordBias(context, candidate)) / temperature
  })
  const probabilities = softmax(logits)
  const candidates = CANDIDATES.map((token, index) => ({ token, tokenId: candidateIds[index], probability: probabilities[index] }))
    .sort((a, b) => b.probability - a.probability)
  const selectedCandidate = selectCandidate(candidates, hash(`${context}|${cycle}|${temperature}`))
  const selected = selectedCandidate.token

  return {
    prompt,
    context,
    cycle,
    temperature,
    tokens,
    tokenIds,
    totalTokenCount: tokenization.total,
    contextTruncated: tokenization.truncated,
    embeddings,
    positioned,
    attention,
    residual,
    feedForward,
    candidates,
    selected,
    selectedId: selectedCandidate.tokenId,
    generated: appendToken(context, selected),
  }
}

export function generateTransformerSequence(prompt: string, options: GenerationOptions) {
  const runs: TransformerRun[] = []
  let context = prompt.trim()
  const maxTokens = Math.max(1, Math.min(5, Math.round(options.maxTokens)))
  for (let cycle = 0; cycle < maxTokens; cycle += 1) {
    const run = runTinyTransformer(context, { ...options, cycle, originalPrompt: prompt.trim() })
    runs.push(run)
    context = run.generated
  }
  return runs
}
