# Transformer ao Vivo

Protótipo didático para visualizar como um Transformer processa linguagem, separado em duas telas sincronizadas:

- `/input?room=AULA-IA`: entrada do aluno no tablet.
- `/display?room=AULA-IA`: visualização projetada e navegável.

## O que é calculado

O protótipo executa localmente um Transformer mínimo, determinístico e não treinado: tokenização, neurônios com pesos fixos, embeddings de 12 dimensões, posição senoidal, três cabeças de atenção causal, conexão residual, normalização, feed-forward, logits e softmax. Não há geração pseudoaleatória: as contas exibidas alimentam as etapas seguintes.

Quando um provedor está configurado, uma função segura da Vercel usa LangChain para gerar a resposta real e recolher `logprobs`. O mini-Transformer continua responsável pela explicação visual; a interface identifica a origem dos resultados.

## Configuração

Crie `.env.local`:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_sua_chave
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
OPENAI_API_KEY=sua_chave_privada
```

Para um endpoint compatível com a API da OpenAI, também podem ser usados `AI_BASE_URL` e `AI_API_KEY`. As chaves de IA existem somente no backend e nunca usam prefixo público do Vite.

O acesso reutiliza a função `public.pulso_is_admin()` do projeto Supabase. A sincronização usa Supabase Realtime Broadcast e também possui fallback local entre abas do mesmo navegador.

`SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` também são lidas por `/api/config`
em runtime. Assim, as variáveis compartilhadas da Vercel continuam disponíveis
mesmo quando não foram incorporadas ao bundle estático. A rota recusa chaves
com prefixo `sb_secret_`.

```bash
npm install
npm run typecheck
npm run dev
```

## Fluxo da aula

O aluno envia o texto pelo tablet. Na projeção, a turma escolhe um token, acompanha obrigatoriamente as oito etapas e então revela a resposta. Cada token da resposta pode ser inspecionado para comparar sua probabilidade com as alternativas concorrentes.
