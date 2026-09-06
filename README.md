# Transformer ao Vivo

Protótipo didático para visualizar como um Transformer processa linguagem, separado em duas telas sincronizadas:

- `/input?room=AULA-IA`: entrada do aluno no tablet.
- `/display?room=AULA-IA`: visualização projetada e navegável.

## O que é calculado

O protótipo executa localmente um Transformer mínimo, determinístico e não treinado: tokenização, embeddings de 12 dimensões, posição senoidal, três cabeças de atenção causal, conexão residual, normalização, feed-forward, logits e seleção do próximo token. Ele serve para validar a experiência de aula e não substitui um modelo de linguagem pré-treinado.

## Configuração

Crie `.env.local`:

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_sua_chave
```

O acesso reutiliza a função `public.pulso_is_admin()` do projeto Supabase. A sincronização usa Supabase Realtime Broadcast e também possui fallback local entre abas do mesmo navegador.

```bash
npm install
npm run dev
```

## Próxima rodada

Depois da validação visual, o motor didático pode ser substituído por um Transformer aberto pré-treinado executado no navegador/WebGPU ou em infraestrutura própria, preservando as mesmas telas e o protocolo de sala.
