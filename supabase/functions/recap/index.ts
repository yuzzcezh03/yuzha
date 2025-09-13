import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
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

    // Get user from auth header
    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const url = new URL(req.url)
    const path = url.pathname.split('/').pop()

    switch (path) {
      case 'my-submissions':
        // Get all submissions for the current user
        const { data: submissions, error } = await supabaseClient
          .from('form_submissions')
          .select('*')
          .eq('user_id', user.id)
          .order('submitted_at', { ascending: false })

        if (error) {
          console.error('Database error:', error)
          return new Response(
            JSON.stringify({ error: 'Failed to fetch submissions', details: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          )
        }

        // Format response
        const response = {
          user_id: user.id,
          total_submissions: submissions.length,
          submissions: submissions.map(submission => ({
            id: submission.id,
            user_id: submission.user_id,
            name: submission.name,
            description: submission.description,
            category: submission.category,
            drive_url: submission.drive_url,
            drive_file_id: submission.drive_file_id,
            submitted_at: submission.submitted_at,
            created_at: submission.created_at
          }))
        }

        return new Response(
          JSON.stringify(response),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      case 'stats':
        // Get user statistics
        const { data: statsData, error: statsError } = await supabaseClient
          .from('form_submissions')
          .select('category, submitted_at')
          .eq('user_id', user.id)

        if (statsError) {
          console.error('Stats error:', statsError)
          return new Response(
            JSON.stringify({ error: 'Failed to fetch statistics', details: statsError.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          )
        }

        // Calculate statistics
        const totalSubmissions = statsData.length
        const categoryCounts = statsData.reduce((acc, item) => {
          acc[item.category] = (acc[item.category] || 0) + 1
          return acc
        }, {})

        // Get submissions by month
        const monthlyStats = statsData.reduce((acc, item) => {
          const month = new Date(item.submitted_at).toISOString().slice(0, 7) // YYYY-MM
          acc[month] = (acc[month] || 0) + 1
          return acc
        }, {})

        const statsResponse = {
          user_id: user.id,
          total_submissions: totalSubmissions,
          categories: categoryCounts,
          monthly_breakdown: monthlyStats,
          latest_submission: statsData.length > 0 ? 
            Math.max(...statsData.map(s => new Date(s.submitted_at).getTime())) : null
        }

        return new Response(
          JSON.stringify(statsResponse),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      case 'health':
        // Health check endpoint
        return new Response(
          JSON.stringify({
            status: 'healthy',
            service: 'user_recap',
            timestamp: new Date().toISOString()
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

      default:
        return new Response(
          JSON.stringify({ error: 'Endpoint not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        )
    }

  } catch (error) {
    console.error('Recap function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})