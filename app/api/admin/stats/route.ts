import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Supabase configuration missing' },
        { status: 500 }
      )
    }

    // Fetch users from Supabase Auth Admin API
    const usersResponse = await fetch(
      `${supabaseUrl}/auth/v1/admin/users`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey
        }
      }
    )

    if (!usersResponse.ok) {
      const errorText = await usersResponse.text()
      console.error('Error fetching users:', errorText)
      return NextResponse.json(
        { error: 'Failed to fetch users' },
        { status: 500 }
      )
    }

    const usersData = await usersResponse.json()

    // Fetch real stats from database using Supabase REST API
    let totalChats = 0
    let totalMessages = 0
    let totalFeedback = 0

    // Get chat count
    const chatsResponse = await fetch(
      `${supabaseUrl}/rest/v1/chats?select=id`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey,
          'Range': '0-0'
        }
      }
    )
    if (chatsResponse.ok) {
      const contentRange = chatsResponse.headers.get('Content-Range')
      if (contentRange) {
        totalChats = parseInt(contentRange.split('/')[1]) || 0
      }
    }

    // Get message count
    const messagesResponse = await fetch(
      `${supabaseUrl}/rest/v1/messages?select=id`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey,
          'Range': '0-0'
        }
      }
    )
    if (messagesResponse.ok) {
      const contentRange = messagesResponse.headers.get('Content-Range')
      if (contentRange) {
        totalMessages = parseInt(contentRange.split('/')[1]) || 0
      }
    }

    // Get feedback count
    const feedbackResponse = await fetch(
      `${supabaseUrl}/rest/v1/feedback?select=id}`,
      {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'apikey': supabaseServiceKey,
          'Range': '0-0'
        }
      }
    )
    if (feedbackResponse.ok) {
      const contentRange = feedbackResponse.headers.get('Content-Range')
      if (contentRange) {
        totalFeedback = parseInt(contentRange.split('/')[1]) || 0
      }
    }

    return NextResponse.json({
      users: usersData.users || [],
      stats: {
        total_chats: totalChats,
        total_messages: totalMessages,
        active_users: usersData.users?.length || 0,
        total_feedback: totalFeedback
      }
    })
  } catch (error) {
    console.error('Admin API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
