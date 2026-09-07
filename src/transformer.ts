import { decode, encode } from 'gpt-tokenizer'

export const STAGES = ['Separar', 'Representar', 'Ordenar', 'Relacionar', 'Preservar', 'Refinar', 'Comparar', 'Continuar'] as const

export type Candidate = { token: string; tokenId: number; logit: number; probability: number }
export type ClassroomToken = { id: number; text: string; display: string }
export type GenerationOptions = { temperature: number; maxTokens: number }
export type NeuronCalculation = {
  labels: string[]
  inputs: number[]
  weights: number[]
  products: number[]
  bias: number
  sum: number
  activation: number
}

export type TransformerRun = {
  prompt: string
  context: string
  cycle: number
  temperature: number
  tokens: string[]
  tokenIds: number[]
  totalTokenCount: number
  contextTruncated: boolean
  neuronCalculations: NeuronCalculation[]
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
const MAX_TOKEN_ID = 200_000
const CANDIDATES = [
  'A', 'O', 'é', 'porque', 'quando', 'o', 'os', 'um', 'uma', 'modelo', 'rede', 'atenção', 'tokens', 'texto', 'contexto',
  'aprende', 'relaciona', 'transforma', 'gera', 'constrói', 'resposta', 'informação', 'decisão', 'anterior', 'precedente',
  'orienta', 'novo', 'caso', 'contextos', 'são', 'semelhantes', 'de', 'com', 'e', '.',
]

const LEGAL_EXAMPLE = ['O', 'precedente', 'orienta', 'o', 'novo', 'caso', 'quando', 'os', 'contextos', 'são', 'semelhantes', '.']
const GENERAL_EXAMPLE = ['O', 'modelo', 'relaciona', 'o', 'texto', 'e', 'constrói', 'uma', 'resposta', 'com', 'contexto', '.']

function fixedWeight(layer: number, input: number, output: number) {
  return Math.sin((layer + 1) * (input + 1) * (output + 1) * .73) * .58
}

function fixedBias(layer: number, output: number) {
  return Math.cos((layer + 1) * (output + 1) * .41) * .09
}

function project(input: number[], size: number, layer: number, activate = false) {
  return Array.from({ length: size }, (_, output) => {
    const sum = input.reduce((total, value, index) => total + value * fixedWeight(layer, index, output), fixedBias(layer, output))
    return activate ? Math.tanh(sum) : sum
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

function tokenFeatures(id: number, text: string, position: number, total: number) {
  const visible = text.trim()
  return [
    Math.min(id, MAX_TOKEN_ID) / MAX_TOKEN_ID,
    total <= 1 ? 0 : position / (total - 1),
    Math.min([...visible].length, 16) / 16,
    visible && /^[^\p{L}\p{N}]+$/u.test(visible) ? 1 : 0,
  ]
}

function neuronCalculation(features: number[], output = 0): NeuronCalculation {
  const weights = features.map((_, input) => fixedWeight(0, input, output))
  const products = features.map((value, index) => value * weights[index])
  const bias = fixedBias(0, output)
  const sum = products.reduce((total, value) => total + value, bias)
  return {
    labels: ['ID normalizado', 'posição', 'tamanho', 'pontuação'],
    inputs: features, weights, products, bias, sum, activation: Math.tanh(sum),
  }
}

function keywordBias(context: string, candidate: string) {
  const text = context.toLocaleLowerCase('pt-BR')
  const last = text.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu)?.at(-1) || ''
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

function guidedTarget(prompt: string, cycle: number) {
  const sequence = /(decisão|juríd|caso|precedente)/i.test(prompt) ? LEGAL_EXAMPLE : GENERAL_EXAMPLE
  return sequence[cycle % sequence.length]
}

function appendToken(context: string, token: string) {
  return token === '.' ? `${context.trim()}.` : `${context.trim()} ${token}`
}

export function runTinyTransformer(context: string, options: Partial<GenerationOptions> & { cycle?: number; originalPrompt?: string } = {}): TransformerRun {
  const temperature = Math.max(.2, Math.min(1.4, options.temperature ?? .7))
  const cycle = Math.max(0, options.cycle ?? 0)
  const prompt = options.originalPrompt || context
  const tokenization = tokenizeForClassroom(context)
  const tokens = tokenization.tokens.map((token) => token.text)
  const tokenIds = tokenization.tokens.map((token) => token.id)
  const features = tokenIds.map((id, index) => tokenFeatures(id, tokens[index], index, tokens.length))
  const neuronCalculations = features.map((values) => neuronCalculation(values))
  const embeddings = features.map((values) => project(values, DIMENSION, 0, true))
  const positioned = embeddings.map((vector, position) => vector.map((value, dimension) => {
    const frequency = 1 / (10000 ** (2 * Math.floor(dimension / 2) / DIMENSION))
    const positionSignal = dimension % 2 === 0 ? Math.sin(position * frequency) : Math.cos(position * frequency)
    return value + positionSignal
  }))

  const attention: number[][][] = []
  const mergedContexts = positioned.map(() => [] as number[])
  for (let head = 0; head < HEADS; head += 1) {
    const queries = positioned.map((vector) => project(vector, HEAD_DIMENSION, 1 + head * 3))
    const keys = positioned.map((vector) => project(vector, HEAD_DIMENSION, 2 + head * 3))
    const values = positioned.map((vector) => project(vector, HEAD_DIMENSION, 3 + head * 3))
    const headAttention: number[][] = []
    for (let queryIndex = 0; queryIndex < tokens.length; queryIndex += 1) {
      const scores = tokens.map((_, keyIndex) => keyIndex > queryIndex ? -1e9 : queries[queryIndex].reduce(
        (sum, value, dimension) => sum + value * keys[keyIndex][dimension], 0,
      ) / Math.sqrt(HEAD_DIMENSION))
      const weights = softmax(scores)
      headAttention.push(weights)
      mergedContexts[queryIndex].push(...Array.from({ length: HEAD_DIMENSION }, (_, dimension) => (
        weights.reduce((sum, weight, keyIndex) => sum + weight * values[keyIndex][dimension], 0)
      )))
    }
    attention.push(headAttention)
  }

  const residual = positioned.map((vector, tokenIndex) => normalize(
    vector.map((value, dimension) => value + mergedContexts[tokenIndex][dimension]),
  ))
  const feedForward = residual.map((vector) => {
    const expanded = project(vector, DIMENSION * 2, 12, true).map((value) => Math.max(0, value))
    const compressed = project(expanded, DIMENSION, 13)
    return normalize(vector.map((value, dimension) => value + compressed[dimension]))
  })

  const last = feedForward.at(-1) || Array(DIMENSION).fill(0)
  const candidateIds = CANDIDATES.map((candidate) => encode(candidate === '.' ? candidate : ` ${candidate}`)[0] || 0)
  const logits = CANDIDATES.map((candidate, candidateIndex) => {
    const candidateFeatures = tokenFeatures(candidateIds[candidateIndex], candidate, candidateIndex, CANDIDATES.length)
    const outputVector = project(candidateFeatures, DIMENSION, 0, true)
    const score = last.reduce((sum, value, index) => sum + value * outputVector[index], 0) / Math.sqrt(DIMENSION)
    const guidedBias = candidate === guidedTarget(prompt, cycle) ? 3.2 : 0
    return (score + keywordBias(context, candidate) + guidedBias) / temperature
  })
  const probabilities = softmax(logits)
  const candidates = CANDIDATES.map((token, index) => ({ token, tokenId: candidateIds[index], logit: logits[index], probability: probabilities[index] }))
    .sort((a, b) => b.probability - a.probability)
  const selectedCandidate = candidates[0] || { token: '', tokenId: 0, logit: 0, probability: 0 }

  return {
    prompt, context, cycle, temperature, tokens, tokenIds,
    totalTokenCount: tokenization.total, contextTruncated: tokenization.truncated,
    neuronCalculations, embeddings, positioned, attention, residual, feedForward, candidates,
    selected: selectedCandidate.token, selectedId: selectedCandidate.tokenId,
    generated: appendToken(context, selectedCandidate.token),
  }
}

export function generateTransformerSequence(prompt: string, options: GenerationOptions) {
  const runs: TransformerRun[] = []
  let context = prompt.trim()
  const maxTokens = Math.max(1, Math.min(12, Math.round(options.maxTokens)))
  for (let cycle = 0; cycle < maxTokens; cycle += 1) {
    const run = runTinyTransformer(context, { ...options, cycle, originalPrompt: prompt.trim() })
    runs.push(run)
    context = run.generated
  }
  return runs
}
