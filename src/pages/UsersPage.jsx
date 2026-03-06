import { useEffect, useState } from 'react'
import { Navigate } from 'react-router'
import { supabase } from '../lib/supabase'
import { supabaseAdmin } from '../lib/supabaseAdmin'
import { useAuth } from '../context/AuthContext'

const ROLES = ['owner', 'manager', 'driver', 'production']

const emptyInvite = { full_name: '', email: '', role: 'driver' }

export default function UsersPage() {
  const { role: currentRole } = useAuth()

  if (currentRole !== 'owner') {
    return <Navigate to="/dashboard" replace />
  }
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Inline edit
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ full_name: '', email: '' })
  const [saving, setSaving] = useState(false)

  // Invite form
  const [showInvite, setShowInvite] = useState(false)
  const [invite, setInvite] = useState(emptyInvite)
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState(null)
  const [inviteSuccess, setInviteSuccess] = useState(null)

  async function fetchUsers() {
    setError(null)
    try {
      const [profilesResult, authResult] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role, created_at'),
        supabaseAdmin.auth.admin.listUsers(),
      ])

      if (profilesResult.error) throw profilesResult.error
      if (authResult.error) throw authResult.error

      const emailMap = {}
      const bannedMap = {}
      for (const u of authResult.data.users) {
        emailMap[u.id] = u.email
        bannedMap[u.id] = !!u.banned_until && new Date(u.banned_until) > new Date()
      }

      const combined = profilesResult.data.map((p) => ({
        ...p,
        email: emailMap[p.id] || '',
        banned: bannedMap[p.id] || false,
      }))

      setUsers(combined)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchUsers() }, [])

  async function handleRoleChange(userId, newRole) {
    const prev = users.map((u) => ({ ...u }))
    setUsers((us) => us.map((u) => u.id === userId ? { ...u, role: newRole } : u))

    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (error) {
      setUsers(prev)
      alert('Failed to update role: ' + error.message)
    }
  }

  async function handleToggleBan(userId, currentlyBanned) {
    const banDuration = currentlyBanned ? 'none' : '876000h' // ~100 years
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: banDuration,
    })

    if (error) {
      alert('Failed to update user status: ' + error.message)
      return
    }

    setUsers((us) =>
      us.map((u) => u.id === userId ? { ...u, banned: !currentlyBanned } : u)
    )
  }

  function startEditing(user) {
    setEditingId(user.id)
    setEditForm({ full_name: user.full_name || '', email: user.email })
  }

  function cancelEditing() {
    setEditingId(null)
    setEditForm({ full_name: '', email: '' })
  }

  async function handleSaveEdit(userId) {
    setSaving(true)
    try {
      const user = users.find((u) => u.id === userId)
      const nameChanged = editForm.full_name !== (user.full_name || '')
      const emailChanged = editForm.email !== user.email

      if (nameChanged) {
        const { error } = await supabase
          .from('profiles')
          .update({ full_name: editForm.full_name })
          .eq('id', userId)
        if (error) throw error
      }

      if (emailChanged) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          email: editForm.email,
        })
        if (error) throw error
      }

      setUsers((us) =>
        us.map((u) =>
          u.id === userId
            ? { ...u, full_name: editForm.full_name, email: editForm.email }
            : u
        )
      )
      setEditingId(null)
    } catch (err) {
      alert('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleInvite(e) {
    e.preventDefault()
    setInviteError(null)
    setInviteSuccess(null)
    setInviting(true)
    console.log('[Invite] VITE_SUPABASE_SERVICE_ROLE_KEY length:', import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY?.length)

    try {
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(invite.email, {
        data: { full_name: invite.full_name, role: invite.role },
      })
      if (error) throw error

      setInviteSuccess(`Invite sent to ${invite.email}`)
      setInvite(emptyInvite)
      setShowInvite(false)
      // Refresh after a brief delay to allow the trigger to create the profile
      setTimeout(() => fetchUsers(), 2000)
    } catch (err) {
      setInviteError(err.message)
    } finally {
      setInviting(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading users...</div>
  }

  if (error) {
    return <div className="p-4 bg-red-50 text-red-700 rounded-lg">{error}</div>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[28px] font-bold text-[#1e3a5f]">Users</h2>
        {!showInvite && (
          <button
            onClick={() => { setShowInvite(true); setInviteError(null); setInviteSuccess(null) }}
            className="min-h-[48px] inline-flex items-center px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
          >
            + Invite User
          </button>
        )}
      </div>

      {inviteSuccess && (
        <div className="p-3 mb-4 rounded-lg bg-green-50 text-green-700 text-sm">{inviteSuccess}</div>
      )}

      {/* Invite Form */}
      {showInvite && (
        <form onSubmit={handleInvite} className="bg-white rounded-lg border border-gray-200 p-5 mb-4 space-y-3">
          <h3 className="font-semibold text-gray-900">Invite User</h3>

          {inviteError && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{inviteError}</div>
          )}

          <div>
            <label htmlFor="invite-name" className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input
              id="invite-name"
              type="text"
              required
              value={invite.full_name}
              onChange={(e) => setInvite({ ...invite, full_name: e.target.value })}
              placeholder="John Doe"
              className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
            <input
              id="invite-email"
              type="email"
              required
              value={invite.email}
              onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              placeholder="user@example.com"
              className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label htmlFor="invite-role" className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              id="invite-role"
              value={invite.role}
              onChange={(e) => setInvite({ ...invite, role: e.target.value })}
              className="w-full py-3 px-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={inviting}
              className="flex-1 min-h-[48px] bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
            <button
              type="button"
              onClick={() => { setShowInvite(false); setInvite(emptyInvite); setInviteError(null) }}
              className="min-h-[48px] px-6 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Users Table */}
      {users.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No users found.</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isEditing = editingId === u.id
                  return (
                    <tr key={u.id} className={`border-b border-gray-100 ${u.banned ? 'bg-red-50/50' : ''}`}>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.full_name}
                            onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                            className="w-full py-1.5 px-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{u.full_name || '—'}</span>
                            {u.banned && (
                              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                Deactivated
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                            className="w-full py-1.5 px-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        ) : (
                          <span className="text-gray-600">{u.email}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className="py-1.5 px-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(u.id)}
                                disabled={saving}
                                className="min-h-[36px] px-3 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                              >
                                {saving ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEditing}
                                disabled={saving}
                                className="min-h-[36px] px-3 text-sm font-medium rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => startEditing(u)}
                                className="min-h-[36px] px-3 text-sm font-medium rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleToggleBan(u.id, u.banned)}
                                className={`min-h-[36px] px-3 text-sm font-medium rounded-md ${
                                  u.banned
                                    ? 'text-green-700 bg-green-50 hover:bg-green-100'
                                    : 'text-red-700 bg-red-50 hover:bg-red-100'
                                }`}
                              >
                                {u.banned ? 'Reactivate' : 'Deactivate'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
