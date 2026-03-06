import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [fullName, setFullName] = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchRole(user) {
    if (!user) {
      setRole(null)
      setFullName(null)
      return
    }

    console.log('[AuthContext] user object:', user)
    console.log('[AuthContext] user_metadata:', user.user_metadata)

    // Try profiles table first
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .maybeSingle()

    console.log('[AuthContext] profiles fetch result:', { profile, profileError })

    if (profile?.role) {
      console.log('[AuthContext] Using role from profiles table:', profile.role)
      setRole(profile.role)
      setFullName(profile.full_name || null)
      return
    }

    // Fallback to user_metadata
    const metaRole = user.user_metadata?.role ?? null
    console.log('[AuthContext] Falling back to user_metadata.role:', metaRole)
    setRole(metaRole)
    setFullName(user.user_metadata?.full_name || null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      fetchRole(session?.user ?? null).then(() => setLoading(false))
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        fetchRole(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const user = session?.user ?? null

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  return (
    <AuthContext.Provider value={{ session, user, role, fullName, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
