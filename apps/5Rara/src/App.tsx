import React, { useEffect, useState } from 'react'
import { supabase } from './services/supabaseClient'

export default function App() {
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking')
  const [errorMessage, setErrorMessage] = useState<string>('')

  useEffect(() => {
    async function checkConnection() {
      try {
        console.log('Testing Supabase connection...')
        console.log('Supabase client:', supabase)
        
        // Test connection by trying to get the current session
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Supabase connection error:', error)
          setConnectionStatus('error')
          setErrorMessage(error.message)
        } else {
          console.log('Supabase connection successful!')
          console.log('Current session:', session)
          setConnectionStatus('connected')
        }
      } catch (err) {
        console.error('Failed to connect to Supabase:', err)
        setConnectionStatus('error')
        setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      }
    }

    checkConnection()
  }, [])

  return (
    <div className="app-shell flex items-center justify-center">
      <div className="text-center space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">RARA</h1>
        <p className="text-sm text-neutral-400">
          Modul RARA - Formulir input.
        </p>
        
        {/* Supabase Connection Status */}
        <div className="mt-6 p-4 rounded-lg border border-neutral-700 bg-neutral-800/50">
          <h3 className="text-lg font-medium mb-2">Supabase Connection</h3>
          
          {connectionStatus === 'checking' && (
            <div className="flex items-center gap-2 text-yellow-400">
              <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></div>
              <span>Checking connection...</span>
            </div>
          )}
          
          {connectionStatus === 'connected' && (
            <div className="flex items-center gap-2 text-green-400">
              <div className="w-4 h-4 bg-green-400 rounded-full"></div>
              <span>Connected successfully!</span>
            </div>
          )}
          
          {connectionStatus === 'error' && (
            <div className="text-red-400">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-4 h-4 bg-red-400 rounded-full"></div>
                <span>Connection failed</span>
              </div>
              <p className="text-sm text-red-300 bg-red-900/20 p-2 rounded">
                {errorMessage}
              </p>
            </div>
          )}
          
          <p className="text-xs text-neutral-500 mt-3">
            Check browser console (F12) for detailed logs
          </p>
        </div>
      </div>
    </div>
  )
}