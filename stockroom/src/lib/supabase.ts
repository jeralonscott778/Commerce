import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Set these in a `.env` file (see README). Without them the dashboard runs on sample data.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const LIVE = !!(url && key)
export const supabase: SupabaseClient | null = LIVE ? createClient(url!, key!) : null
