type VercelResponse = {
  status: (code: number) => VercelResponse
  setHeader: (name: string, value: string) => void
  json: (body: Record<string, unknown>) => void
}

export default function handler(_request: unknown, response: VercelResponse) {
  response.setHeader('Cache-Control', 'no-store, max-age=0')
  const supabaseUrl = process.env.SUPABASE_URL || ''
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || ''

  if (!supabaseUrl || !supabasePublishableKey || supabasePublishableKey.startsWith('sb_secret_')) {
    response.status(503).json({
      configured: false,
      missing: [
        ...(!supabaseUrl ? ['SUPABASE_URL'] : []),
        ...(!supabasePublishableKey ? ['SUPABASE_PUBLISHABLE_KEY'] : []),
      ],
    })
    return
  }

  response.status(200).json({ configured: true, supabaseUrl, supabasePublishableKey })
}
