// Supabase client - install @supabase/supabase-js to use
// npm install @supabase/supabase-js

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabaseClient: any = null

export const getSupabaseClient = async () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }
  
  if (!supabaseClient) {
    try {
      // Dynamic import to avoid errors if package not installed
      const { createClient } = await import('@supabase/supabase-js')
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
    } catch (error) {
      console.warn('@supabase/supabase-js not installed. Run: npm install @supabase/supabase-js')
      throw new Error('Supabase client not available. Please install @supabase/supabase-js')
    }
  }
  
  return supabaseClient
}

// Export environment variables for direct access if needed
export { supabaseUrl, supabaseAnonKey }

