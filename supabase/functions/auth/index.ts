import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const url = new URL(req.url)
    const path = url.pathname.split('/').pop()

    // Handle different auth endpoints
    switch (path) {
      case 'me':
        // Get current user information
        const {
          data: { user },
        } = await supabaseClient.auth.getUser()

        if (!user) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
          )
        }

        return new Response(
          JSON.stringify({
            id: user.id,
            email: user.email,
            created_at: user.created_at,
            last_sign_in_at: user.last_sign_in_at,
            user_metadata: user.user_metadata
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      case 'health':
        // Health check endpoint
        return new Response(
          JSON.stringify({
            status: 'healthy',
            service: 'authentication',
            timestamp: new Date().toISOString()
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      case 'sign-up':
        if (req.method !== 'POST') {
          return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
          )
        }

        const { email, password } = await req.json()
        
        if (!email || !password) {
          return new Response(
            JSON.stringify({ error: 'Email and password are required' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          )
        }

        const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
          email,
          password
        })

        if (signUpError) {
          return new Response(
            JSON.stringify({ error: signUpError.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          )
        }

        return new Response(
          JSON.stringify({
            message: 'Check your email for confirmation link',
            user: signUpData.user,
            session: signUpData.session
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      case 'sign-in':
        if (req.method !== 'POST') {
          return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
          )
        }

        const { email: loginEmail, password: loginPassword } = await req.json()
        
        if (!loginEmail || !loginPassword) {
          return new Response(
            JSON.stringify({ error: 'Email and password are required' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          )
        }

        const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
          email: loginEmail,
          password: loginPassword
        })

        if (signInError) {
          return new Response(
            JSON.stringify({ error: signInError.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          )
        }

        return new Response(
          JSON.stringify({
            user: signInData.user,
            session: signInData.session
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      case 'sign-out':
        if (req.method !== 'POST') {
          return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
          )
        }

        const { error: signOutError } = await supabaseClient.auth.signOut()

        if (signOutError) {
          return new Response(
            JSON.stringify({ error: signOutError.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          )
        }

        return new Response(
          JSON.stringify({ message: 'Signed out successfully' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      default:
        return new Response(
          JSON.stringify({ error: 'Endpoint not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        )
    }

  } catch (error) {
    console.error('Auth function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})