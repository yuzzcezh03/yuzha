import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DatabaseError {
  message: string;
  details: string;
  hint: string;
  code: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user from JWT token
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse URL and method
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const method = req.method
    
    // Remove 'functions/v1/user-hub' from path
    const route = pathParts.slice(3).join('/')
    
    console.log(`User Hub: ${method} /${route} for user ${user.id}`)

    // Route handler
    switch (true) {
      // 🔄 TWO-WAY SYNC ROUTES
      
      // GET /settings - Load UI preferences
      case route === 'settings' && method === 'GET':
        return await handleGetConfig(supabase, user.id, 'settings', url.searchParams.get('profile') || 'default')
      
      // POST /settings - Save UI preferences  
      case route === 'settings' && method === 'POST':
        const settingsData = await req.json()
        return await handleSaveConfig(supabase, user.id, 'settings', settingsData, url.searchParams.get('profile') || 'default')
      
      // GET /sync-data - Load app sync data
      case route === 'sync-data' && method === 'GET':
        return await handleGetConfig(supabase, user.id, 'sync-data', url.searchParams.get('profile') || 'default')
      
      // POST /sync-data - Save app sync data
      case route === 'sync-data' && method === 'POST':
        const syncData = await req.json()
        return await handleSaveConfig(supabase, user.id, 'sync-data', syncData, url.searchParams.get('profile') || 'default')
      
      // DELETE /settings or /sync-data - Reset configs
      case (route === 'settings' || route === 'sync-data') && method === 'DELETE':
        return await handleDeleteConfig(supabase, user.id, route, url.searchParams.get('profile') || 'default')

      // 📝 ONE-WAY FORM ROUTES
      
      // POST /module-*/submit - Module form submissions
      case route.includes('/submit') && method === 'POST':
        const moduleMatch = route.match(/^(module-[^/]+|feedback)\/submit$/)
        if (moduleMatch) {
          const moduleName = moduleMatch[1]
          const formData = await req.json()
          return await handleModuleSubmission(supabase, user.id, moduleName, formData)
        }
        break

      // 🗂️ ASSET ROUTES
      
      // GET /assets - List user assets
      case route === 'assets' && method === 'GET':
        return await handleGetAssets(supabase, user.id, url.searchParams)
      
      // POST /assets - Upload asset metadata
      case route === 'assets' && method === 'POST':
        const assetData = await req.json()
        return await handleSaveAsset(supabase, user.id, assetData)
      
      // DELETE /assets/:id - Delete asset
      case route.startsWith('assets/') && method === 'DELETE':
        const assetId = route.split('/')[1]
        return await handleDeleteAsset(supabase, user.id, assetId)

      // 📊 ANALYTICS ROUTES
      
      // GET /analytics - User activity analytics
      case route === 'analytics' && method === 'GET':
        return await handleGetAnalytics(supabase, user.id)

      default:
        return new Response(
          JSON.stringify({ 
            error: 'Route not found',
            available_routes: [
              'GET/POST/DELETE /settings',
              'GET/POST/DELETE /sync-data', 
              'POST /module-*/submit',
              'POST /feedback/submit',
              'GET/POST/DELETE /assets',
              'GET /analytics'
            ]
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

  } catch (error) {
    console.error('User Hub Error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// 🔄 CONFIG HANDLERS (Two-way sync)

async function handleGetConfig(supabase: any, userId: string, configType: string, profile: string) {
  const { data, error } = await supabase
    .from('user_configs')
    .select('config_data, updated_at')
    .eq('user_id', userId)
    .eq('config_type', configType)
    .eq('profile_name', profile)
    .single()

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
    throw error
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: data?.config_data || {},
      profile,
      last_updated: data?.updated_at || null
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleSaveConfig(supabase: any, userId: string, configType: string, configData: any, profile: string) {
  const { data, error } = await supabase
    .from('user_configs')
    .upsert({
      user_id: userId,
      config_type: configType,
      profile_name: profile,
      config_data: configData
    }, {
      onConflict: 'user_id,profile_name,config_type'
    })
    .select()

  if (error) {
    throw error
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `${configType} saved successfully`,
      profile,
      data: configData
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleDeleteConfig(supabase: any, userId: string, configType: string, profile: string) {
  const { error } = await supabase
    .from('user_configs')
    .delete()
    .eq('user_id', userId)
    .eq('config_type', configType)
    .eq('profile_name', profile)

  if (error) {
    throw error
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `${configType} deleted successfully`,
      profile
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// 📝 FORM HANDLERS (One-way)

async function handleModuleSubmission(supabase: any, userId: string, moduleName: string, submissionData: any) {
  const { data, error } = await supabase
    .from('module_submissions')
    .insert({
      user_id: userId,
      module_name: moduleName,
      submission_data: submissionData,
      metadata: {
        ip: 'edge-function',
        user_agent: 'user-hub',
        timestamp: new Date().toISOString()
      }
    })
    .select()

  if (error) {
    throw error
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `${moduleName} submission saved successfully`,
      submission_id: data[0].id
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// 🗂️ ASSET HANDLERS

async function handleGetAssets(supabase: any, userId: string, searchParams: URLSearchParams) {
  let query = supabase
    .from('user_assets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  // Filter by asset type if specified
  const assetType = searchParams.get('type')
  if (assetType) {
    query = query.eq('asset_type', assetType)
  }

  // Limit results
  const limit = parseInt(searchParams.get('limit') || '50')
  query = query.limit(limit)

  const { data, error } = await query

  if (error) {
    throw error
  }

  return new Response(
    JSON.stringify({
      success: true,
      assets: data,
      count: data.length
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleSaveAsset(supabase: any, userId: string, assetData: any) {
  const { data, error } = await supabase
    .from('user_assets')
    .insert({
      user_id: userId,
      asset_name: assetData.name,
      asset_type: assetData.type || 'document',
      file_path: assetData.path,
      file_size: assetData.size || null,
      mime_type: assetData.mimeType || null,
      metadata: assetData.metadata || {},
      is_public: assetData.isPublic || false
    })
    .select()

  if (error) {
    throw error
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Asset saved successfully',
      asset: data[0]
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleDeleteAsset(supabase: any, userId: string, assetId: string) {
  const { error } = await supabase
    .from('user_assets')
    .delete()
    .eq('user_id', userId)
    .eq('id', assetId)

  if (error) {
    throw error
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Asset deleted successfully'
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// 📊 ANALYTICS HANDLER

async function handleGetAnalytics(supabase: any, userId: string) {
  // Get config count
  const { data: configs, error: configError } = await supabase
    .from('user_configs')
    .select('config_type, profile_name, updated_at')
    .eq('user_id', userId)

  // Get submission count  
  const { data: submissions, error: submissionError } = await supabase
    .from('module_submissions')
    .select('module_name, created_at')
    .eq('user_id', userId)

  // Get asset count
  const { data: assets, error: assetError } = await supabase
    .from('user_assets')
    .select('asset_type, created_at')
    .eq('user_id', userId)

  if (configError || submissionError || assetError) {
    throw configError || submissionError || assetError
  }

  return new Response(
    JSON.stringify({
      success: true,
      analytics: {
        configs: configs?.length || 0,
        submissions: submissions?.length || 0,
        assets: assets?.length || 0,
        last_activity: Math.max(
          ...[configs, submissions, assets]
            .flat()
            .map(item => new Date(item?.updated_at || item?.created_at || 0).getTime())
        )
      },
      breakdown: {
        config_types: configs?.reduce((acc: any, c: any) => {
          acc[c.config_type] = (acc[c.config_type] || 0) + 1
          return acc
        }, {}),
        submission_modules: submissions?.reduce((acc: any, s: any) => {
          acc[s.module_name] = (acc[s.module_name] || 0) + 1
          return acc
        }, {}),
        asset_types: assets?.reduce((acc: any, a: any) => {
          acc[a.asset_type] = (acc[a.asset_type] || 0) + 1
          return acc
        }, {})
      }
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}