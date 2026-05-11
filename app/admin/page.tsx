'use client'

import { useEffect, useState } from 'react'

interface User {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  email_confirmed_at: string | null
}

interface ChatStats {
  total_chats: number
  total_messages: number
  active_users: number
  total_feedback: number
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<ChatStats>({
    total_chats: 0,
    total_messages: 0,
    active_users: 0,
    total_feedback: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAdminData()
  }, [])

  const fetchAdminData = async () => {
    try {
      const response = await fetch('/api/admin/stats')
      if (!response.ok) {
        throw new Error('Failed to fetch admin data')
      }
      const data = await response.json()
      setUsers(data.users || [])
      setStats(
        data.stats || { total_chats: 0, total_messages: 0, active_users: 0 }
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">Error: {error}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">brok Admin</h1>
          <p className="text-muted-foreground mt-2">
            User management and analytics
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-card rounded-lg border p-6">
            <h3 className="text-sm font-medium text-muted-foreground">
              Total Users
            </h3>
            <p className="text-3xl font-bold mt-2">{users.length}</p>
          </div>
          <div className="bg-card rounded-lg border p-6">
            <h3 className="text-sm font-medium text-muted-foreground">
              Active Users
            </h3>
            <p className="text-3xl font-bold mt-2">{stats.active_users}</p>
          </div>
          <div className="bg-card rounded-lg border p-6">
            <h3 className="text-sm font-medium text-muted-foreground">
              Total Chats
            </h3>
            <p className="text-3xl font-bold mt-2">{stats.total_chats}</p>
          </div>
          <div className="bg-card rounded-lg border p-6">
            <h3 className="text-sm font-medium text-muted-foreground">
              Total Messages
            </h3>
            <p className="text-3xl font-bold mt-2">{stats.total_messages}</p>
          </div>
        </div>

        {/* Additional Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-card rounded-lg border p-6">
            <h3 className="text-sm font-medium text-muted-foreground">
              User Feedback
            </h3>
            <p className="text-3xl font-bold mt-2">
              {stats.total_feedback || 0}
            </p>
          </div>
          <div className="bg-card rounded-lg border p-6">
            <h3 className="text-sm font-medium text-muted-foreground">
              Search Mode
            </h3>
            <p className="text-lg font-bold mt-2">Brok AI</p>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-card rounded-lg border">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold">Users</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-4 font-medium">Email</th>
                  <th className="text-left p-4 font-medium">Created</th>
                  <th className="text-left p-4 font-medium">Last Sign In</th>
                  <th className="text-left p-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-4 text-center text-muted-foreground"
                    >
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map(user => (
                    <tr key={user.id} className="border-b">
                      <td className="p-4">{user.email}</td>
                      <td className="p-4">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4">
                        {user.last_sign_in_at
                          ? new Date(user.last_sign_in_at).toLocaleDateString()
                          : 'Never'}
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            user.email_confirmed_at
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {user.email_confirmed_at ? 'Active' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
