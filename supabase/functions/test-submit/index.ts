import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

interface TestFormData {
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
    // Create Supabase client with service role for testing
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse request body
    const { name, description, category, photo }: TestFormData = await req.json()

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

    // Mock user for testing
    const testUserId = 'test-user-backend'

    // Generate unique filename
    const fileExtension = photo.filename.split('.').pop() || 'jpg'
    const uniqueFilename = `test/${testUserId}_${name}_${crypto.randomUUID().slice(0, 8)}.${fileExtension}`
    
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
      
      // Create JWT token for Google API (simplified)
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
              name: `test_${uniqueFilename}`,
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
        }
      }
    } catch (driveError) {
      console.warn('Google Drive upload failed:', driveError)
      driveFileId = `test_backup_${crypto.randomUUID()}`
      driveUrl = publicUrl
    }

    // Add to Google Sheets
    try {
      const serviceAccount = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT') ?? '{}')
      
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
        
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${Deno.env.get('GOOGLE_SPREADSHEET_ID')}/values/Sheet1!A:F:append?valueInputOption=RAW`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            values: [[
              new Date().toISOString(),
              testUserId,
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

    // Return success response (don't save to database for test)
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Test form submitted successfully!',
        user_id: testUserId,
        name,
        description: description || '',
        category,
        drive_url: driveUrl || publicUrl,
        drive_file_id: driveFileId,
        submitted_at: new Date().toISOString(),
        storage_url: publicUrl,
        test_mode: true
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Test function error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})