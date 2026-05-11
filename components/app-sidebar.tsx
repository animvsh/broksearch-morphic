'use client'

import { Suspense } from 'react'
import Link from 'next/link'

import {
  BookOpen,
  Code2,
  Compass,
  FlaskConical,
  Mail,
  PanelLeft,
  PlugZap,
  Plus,
  Presentation,
  Search,
  TerminalSquare
} from 'lucide-react'

import { cn } from '@/lib/utils'

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail
} from '@/components/ui/sidebar'

import { ChatHistorySection } from './sidebar/chat-history-section'
import { ChatHistorySkeleton } from './sidebar/chat-history-skeleton'
import { IconLogo } from './ui/icons'

export default function AppSidebar() {
  return (
    <Sidebar side="left" variant="sidebar" collapsible="icon">
      <SidebarHeader className="flex flex-row items-center justify-between">
        <Link href="/" className="flex items-center gap-2 px-2 py-3">
          <IconLogo className={cn('size-5')} />
          <span className="font-semibold text-sm group-data-[collapsible=icon]:hidden">
            brok
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex flex-col px-2 py-4 h-full">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="New search">
              <Link href="/" className="flex items-center gap-2">
                <Plus className="size-4" />
                <span>New</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Search">
              <Link href="/" className="flex items-center gap-2">
                <Search className="size-4" />
                <span>Search</span>
              </Link>
            </SidebarMenuButton>
            <SidebarMenuSub>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild size="sm">
                  <Link href="/discover" className="flex items-center gap-2">
                    <Compass className="size-4" />
                    <span>Discover</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild size="sm">
                  <Link href="/library" className="flex items-center gap-2">
                    <BookOpen className="size-4" />
                    <span>Library</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild size="sm">
                  <Link href="/spaces" className="flex items-center gap-2">
                    <PanelLeft className="size-4" />
                    <span>Spaces</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="BrokMail">
              <Link href="/brokmail" className="flex items-center gap-2">
                <Mail className="size-4" />
                <span>BrokMail</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Brok Code">
              <Link href="/brokcode" className="flex items-center gap-2">
                <Code2 className="size-4" />
                <span>Code</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="BrokCode TUI">
              <Link href="/brokcode/tui" className="flex items-center gap-2">
                <TerminalSquare className="size-4" />
                <span>TUI</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Playground">
              <Link href="/playground" className="flex items-center gap-2">
                <FlaskConical className="size-4" />
                <span>Playground</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Presentations">
              <Link href="/presentations" className="flex items-center gap-2">
                <Presentation className="size-4" />
                <span>Slides</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Integrations">
              <Link href="/integrations" className="flex items-center gap-2">
                <PlugZap className="size-4" />
                <span>Integrations</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="hidden flex-1 overflow-y-auto group-data-[collapsible=icon]:hidden group-data-[collapsible=offcanvas]:hidden 2xl:block">
          <Suspense fallback={<ChatHistorySkeleton />}>
            <ChatHistorySection />
          </Suspense>
        </div>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
