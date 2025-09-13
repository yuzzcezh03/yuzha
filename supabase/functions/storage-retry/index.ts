import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'retry'

    switch (action) {
      case 'retry':
        return await handleRetryFailedUploads(supabase)
      case 'cleanup':
        return await handleCleanupSuccessfulUploads(supabase)
      case 'status':
        return await handleGetUploadStatus(supabase, url.searchParams)
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action. Use: retry, cleanup, or status' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

  } catch (error) {
    console.error('Storage Retry Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// 🔄 RETRY FAILED UPLOADS
async function handleRetryFailedUploads(supabase: any) {
  console.log('🔄 Starting retry process for failed uploads...')

  // Get failed uploads that need retry
  const { data: failedUploads, error: fetchError } = await supabase
    .rpc('get_failed_uploads', { max_retries: 3 })

  if (fetchError) {
    throw fetchError
  }

  if (!failedUploads || failedUploads.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        message: 'No failed uploads to retry',
        retried: 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log(`📋 Found ${failedUploads.length} failed uploads to retry`)

  let retriedCount = 0
  let successCount = 0

  for (const upload of failedUploads) {
    try {
      console.log(`🔄 Retrying upload: ${upload.file_name}`)

      // Download file from Supabase storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('form-photos')
        .download(upload.file_path)

      if (downloadError) {
        await logUploadError(supabase, upload.id, 'File not found in storage', downloadError)
        continue
      }

      // Convert to array buffer
      const arrayBuffer = await fileData.arrayBuffer()
      const photoData = new Uint8Array(arrayBuffer)

      // Retry Google Drive upload
      const driveResult = await uploadToGoogleDrive(photoData, upload.file_name)

      if (driveResult.success) {
        // Update status to success
        await supabase
          .from('upload_status')
          .update({
            drive_file_id: driveResult.fileId,
            drive_url: driveResult.url,
            upload_status: 'drive_success',
            last_retry_at: new Date().toISOString()
          })
          .eq('id', upload.id)

        // Log success
        await logUploadInfo(supabase, upload.id, `Retry successful for ${upload.file_name}`)

        // Delete from Supabase storage (cleanup)
        await supabase.storage
          .from('form-photos')
          .remove([upload.file_path])

        await supabase
          .from('upload_status')
          .update({ upload_status: 'cleanup_done' })
          .eq('id', upload.id)

        successCount++
      } else {
        // Update retry count and error
        await supabase
          .from('upload_status')
          .update({
            retry_count: upload.retry_count + 1,
            error_message: driveResult.error,
            last_retry_at: new Date().toISOString()
          })
          .eq('id', upload.id)

        await logUploadError(supabase, upload.id, `Retry ${upload.retry_count + 1} failed`, driveResult.error)
      }

      retriedCount++

    } catch (retryError) {
      console.error(`❌ Retry failed for ${upload.file_name}:`, retryError)
      await logUploadError(supabase, upload.id, 'Retry process error', retryError.message)
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `Retry process completed`,
      total_found: failedUploads.length,
      retried: retriedCount,
      successful: successCount
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// 🗑️ CLEANUP SUCCESSFUL UPLOADS
async function handleCleanupSuccessfulUploads(supabase: any) {
  console.log('🗑️ Starting cleanup of successful uploads...')

  // Find uploads that succeeded but still have files in storage
  const { data: successfulUploads, error: fetchError } = await supabase
    .from('upload_status')
    .select('*')
    .eq('upload_status', 'drive_success')
    .limit(50)

  if (fetchError) {
    throw fetchError
  }

  if (!successfulUploads || successfulUploads.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        message: 'No successful uploads to cleanup',
        cleaned: 0
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let cleanedCount = 0

  for (const upload of successfulUploads) {
    try {
      // Try to delete from Supabase storage
      const { error: deleteError } = await supabase.storage
        .from('form-photos')
        .remove([upload.file_path])

      if (!deleteError) {
        // Update status to cleanup done
        await supabase
          .from('upload_status')
          .update({ upload_status: 'cleanup_done' })
          .eq('id', upload.id)

        await logUploadInfo(supabase, upload.id, `Cleanup completed for ${upload.file_name}`)
        cleanedCount++
      }

    } catch (cleanupError) {
      console.error(`❌ Cleanup failed for ${upload.file_name}:`, cleanupError)
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `Cleanup completed`,
      total_found: successfulUploads.length,
      cleaned: cleanedCount
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// 📊 GET UPLOAD STATUS
async function handleGetUploadStatus(supabase: any, searchParams: URLSearchParams) {
  const userId = searchParams.get('user_id')
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '50')

  let query = supabase
    .from('upload_status')
    .select(`
      *,
      upload_logs (
        log_level,
        message,
        created_at
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (userId) {
    query = query.eq('user_id', userId)
  }

  if (status) {
    query = query.eq('upload_status', status)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  // Get summary statistics
  const { data: stats } = await supabase
    .from('upload_status')
    .select('upload_status')
    .then(({ data }) => {
      const summary = data?.reduce((acc: any, item: any) => {
        acc[item.upload_status] = (acc[item.upload_status] || 0) + 1
        return acc
      }, {})
      return { data: summary }
    })

  return new Response(
    JSON.stringify({
      success: true,
      uploads: data,
      statistics: stats || {},
      total: data?.length || 0
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

// 🚀 GOOGLE DRIVE UPLOAD HELPER
async function uploadToGoogleDrive(photoData: Uint8Array, filename: string) {
  try {
    const serviceAccount = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT') ?? '{}')
    
    // Create JWT token for Google API
    const jwtHeader = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const jwtPayload = btoa(JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/drive.file',
      aud: 'https://oauth2.googleapis.com/token',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000)
    }))

    const jwtToken = `${jwtHeader}.${jwtPayload}`
    
    // Get access token from Google
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwtToken
      })
    })
    
    if (!tokenResponse.ok) {
      return { success: false, error: 'Failed to get Google access token' }
    }

    const tokenData = await tokenResponse.json()
    
    // Upload to Google Drive
    const driveResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'multipart/related; boundary="boundary"'
      },
      body: [
        '--boundary',
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify({
          name: filename,
          parents: [Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')]
        }),
        '',
        '--boundary',
        'Content-Type: image/jpeg',
        '',
        new TextDecoder().decode(photoData),
        '',
        '--boundary--'
      ].join('\r\n')
    })
    
    if (!driveResponse.ok) {
      return { success: false, error: `Drive upload failed: ${driveResponse.status}` }
    }

    const driveData = await driveResponse.json()
    const driveUrl = `https://drive.google.com/file/d/${driveData.id}/view`
    
    // Make file publicly viewable
    await fetch(`https://www.googleapis.com/drive/v3/files/${driveData.id}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' })
    })

    return { 
      success: true, 
      fileId: driveData.id, 
      url: driveUrl 
    }

  } catch (error) {
    return { success: false, error: error.message }
  }
}

// 📝 LOGGING HELPERS
async function logUploadInfo(supabase: any, uploadId: string, message: string) {
  await supabase
    .from('upload_logs')
    .insert({
      upload_id: uploadId,
      log_level: 'info',
      message: message
    })
}

async function logUploadError(supabase: any, uploadId: string, message: string, details: any) {
  await supabase
    .from('upload_logs')
    .insert({
      upload_id: uploadId,
      log_level: 'error',
      message: message,
      details: { error: details }
    })
}