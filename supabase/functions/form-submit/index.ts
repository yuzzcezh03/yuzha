import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

interface FormData {
  name: string
  description?: string
  category: string
  photo: {
    data: string // base64 encoded
    filename: string
    contentType: string
  }
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

    // Parse request body
    const { name, description, category, photo }: FormData = await req.json()

    // Validate required fields
    if (!name || name.length < 1 || name.length > 100) {
      return new Response(
        JSON.stringify({ error: 'Name is required and must be 1-100 characters' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!category || category.length < 1 || category.length > 50) {
      return new Response(
        JSON.stringify({ error: 'Category is required and must be 1-50 characters' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (description && description.length > 500) {
      return new Response(
        JSON.stringify({ error: 'Description must be less than 500 characters' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    if (!photo || !photo.data || !photo.filename) {
      return new Response(
        JSON.stringify({ error: 'Photo is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Generate unique filename
    const fileExtension = photo.filename.split('.').pop() || 'jpg'
    const uniqueFilename = `${user.id}/${name}_${crypto.randomUUID().slice(0, 8)}.${fileExtension}`
    
    // Convert base64 to blob
    const photoData = Uint8Array.from(atob(photo.data), c => c.charCodeAt(0))
    
    // Upload photo to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('form-photos')
      .upload(uniqueFilename, photoData, {
        contentType: photo.contentType || 'image/jpeg',
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return new Response(
        JSON.stringify({ error: 'Failed to upload photo', details: uploadError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Get public URL for the uploaded photo
    const { data: { publicUrl } } = supabaseClient.storage
      .from('form-photos')
      .getPublicUrl(uniqueFilename)

    // Upload to Google Drive using service account
    let driveFileId = ''
    let driveUrl = ''
    
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

      // Create signed JWT (simplified - in production, use proper JWT library)
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
      
      if (tokenResponse.ok) {
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
              name: `${uniqueFilename}`,
              parents: [Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')]
            }),
            '',
            '--boundary',
            `Content-Type: ${photo.contentType}`,
            '',
            new TextDecoder().decode(photoData),
            '',
            '--boundary--'
          ].join('\r\n')
        })
        
        if (driveResponse.ok) {
          const driveData = await driveResponse.json()
          driveFileId = driveData.id
          driveUrl = `https://drive.google.com/file/d/${driveFileId}/view`
          
          // Make file publicly viewable
          await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}/permissions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
          })
        }
      }
    } catch (driveError) {
      // Log but don't fail - we have Supabase storage as backup
      console.warn('Google Drive upload failed:', driveError)
      driveFileId = `backup_${crypto.randomUUID()}`
      driveUrl = publicUrl
    }

    // Add to Google Sheets
    try {
      const serviceAccount = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT') ?? '{}')
      
      // Similar JWT process for Sheets API
      const jwtHeader = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
      const jwtPayload = btoa(JSON.stringify({
        iss: serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000)
      }))

      const jwtToken = `${jwtHeader}.${jwtPayload}`
      
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwtToken
        })
      })
      
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json()
        
        // Append to Google Sheets
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${Deno.env.get('GOOGLE_SPREADSHEET_ID')}/values/Sheet1!A:F:append?valueInputOption=RAW`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [[
              new Date().toISOString(),
              user.id,
              name,
              description || '',
              category,
              driveUrl || publicUrl
            ]]
          })
        })
      }
    } catch (sheetsError) {
      console.warn('Google Sheets update failed:', sheetsError)
    }

    // Save to Supabase database
    const { data: submissionData, error: dbError } = await supabaseClient
      .from('form_submissions')
      .insert({
        user_id: user.id,
        name,
        description: description || '',
        category,
        drive_url: driveUrl || publicUrl,
        drive_file_id: driveFileId,
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return new Response(
        JSON.stringify({ error: 'Failed to save submission', details: dbError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        id: submissionData.id,
        user_id: user.id,
        name,
        description: description || '',
        category,
        drive_url: driveUrl || publicUrl,
        drive_file_id: driveFileId,
        submitted_at: submissionData.submitted_at,
        storage_url: publicUrl
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})