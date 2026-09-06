import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "https://lbpuwieyarkixxyxktvq.supabase.co"
const supabasePublishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_W6FHoitQrs44ISb5GScZ4A_FWPRF5LD"

export default defineConfig({
  plugins: [react()],
  define: {
    __SUPABASE_URL__: JSON.stringify(supabaseUrl),
    __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabasePublishableKey),
  },
})
