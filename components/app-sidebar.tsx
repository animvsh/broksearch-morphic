'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
import { IconBlinkingLogo } from './ui/icons'

export default function AppSidebar() {
  const pathname = usePathname()
  const navButtonClass =
    'group/sidebar relative h-10 rounded-2xl border border-transparent px-2 text-[13px] font-medium text-zinc-500 transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-200 hover:bg-white hover:text-zinc-950 hover:shadow-sm active:translate-y-0 data-[active=true]:border-violet-200 data-[active=true]:bg-white data-[active=true]:text-violet-700 data-[active=true]:shadow-sm'
  const subButtonClass =
    'group/subnav rounded-2xl border border-transparent px-2 text-zinc-400 transition-all duration-150 hover:-translate-y-0.5 hover:border-zinc-200 hover:bg-white hover:text-zinc-950 hover:shadow-sm active:translate-y-0 data-[active=true]:border-violet-200 data-[active=true]:bg-white data-[active=true]:text-violet-700 data-[active=true]:shadow-sm'
  const iconShellClass =
    'flex size-7 items-center justify-center rounded-xl border border-transparent text-zinc-400 transition-all duration-150 group-data-[active=true]/sidebar:bg-violet-600 group-data-[active=true]/sidebar:text-white group-hover/sidebar:bg-zinc-100 group-hover/sidebar:text-zinc-900'
  const subIconShellClass =
    'flex size-6 items-center justify-center rounded-xl border border-transparent text-zinc-400 transition-all duration-150 group-data-[active=true]/subnav:bg-violet-600 group-data-[active=true]/subnav:text-white group-hover/subnav:bg-zinc-100 group-hover/subnav:text-zinc-900'
  const isActive = (href: string) =>
    href === '/'
      ? pathname === '/'
      : pathname === href || pathname.startsWith(`${href}/`)
  const isCodeActive =
    pathname.startsWith('/brokcode') && !pathname.startsWith('/brokcode/tui')

  return (
    <Sidebar
      side="left"
      variant="sidebar"
      collapsible="icon"
      className="border-r border-zinc-200/70 bg-zinc-50/80 text-zinc-950 shadow-none backdrop-blur-xl"
    >
      <SidebarHeader className="flex flex-row items-center justify-between border-b border-zinc-200/70 bg-white/70">
        <Link href="/" className="flex items-center gap-2 px-2 py-3">
          <span className="brand-mark rounded-full p-1.5">
            <IconBlinkingLogo className={cn('size-5')} />
          </span>
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="brand-wordmark truncate text-sm font-semibold text-zinc-950">
              brok
            </span>
            <span className="sidebar-section-label text-[10px] font-medium leading-none">
              agent studio
            </span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex flex-col px-2 py-4 h-full">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="New search"
              className={navButtonClass}
            >
              <Link href="/" className="flex items-center gap-2">
                <span className={iconShellClass}>
                  <Plus className="size-4" />
                </span>
                <span>New</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Search"
              className={navButtonClass}
              isActive={isActive('/') || isActive('/search')}
            >
              <Link href="/" className="flex items-center gap-2">
                <span className={iconShellClass}>
                  <Search className="size-4" />
                </span>
                <span className="flex-1">Search</span>
                {isActive('/') || isActive('/search') ? (
                  <span className="nav-live-dot" aria-hidden />
                ) : null}
              </Link>
            </SidebarMenuButton>
            <SidebarMenuSub>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  asChild
                  size="sm"
                  className={subButtonClass}
                  isActive={isActive('/discover')}
                >
                  <Link href="/discover" className="flex items-center gap-2">
                    <span className={subIconShellClass}>
                      <Compass className="size-4" />
                    </span>
                    <span className="flex-1">Discover</span>
                    {isActive('/discover') ? (
                      <span className="nav-live-dot" aria-hidden />
                    ) : null}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  asChild
                  size="sm"
                  className={subButtonClass}
                  isActive={isActive('/library')}
                >
                  <Link href="/library" className="flex items-center gap-2">
                    <span className={subIconShellClass}>
                      <BookOpen className="size-4" />
                    </span>
                    <span className="flex-1">Library</span>
                    {isActive('/library') ? (
                      <span className="nav-live-dot" aria-hidden />
                    ) : null}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  asChild
                  size="sm"
                  className={subButtonClass}
                  isActive={isActive('/spaces')}
                >
                  <Link href="/spaces" className="flex items-center gap-2">
                    <span className={subIconShellClass}>
                      <PanelLeft className="size-4" />
                    </span>
                    <span className="flex-1">Spaces</span>
                    {isActive('/spaces') ? (
                      <span className="nav-live-dot" aria-hidden />
                    ) : null}
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="BrokMail"
              className={navButtonClass}
              isActive={isActive('/brokmail')}
            >
              <Link href="/brokmail" className="flex items-center gap-2">
                <span className={iconShellClass}>
                  <Mail className="size-4" />
                </span>
                <span className="flex-1">BrokMail</span>
                {isActive('/brokmail') ? (
                  <span className="nav-live-dot" aria-hidden />
                ) : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Brok Code"
              className={navButtonClass}
              isActive={isCodeActive}
            >
              <Link href="/brokcode" className="flex items-center gap-2">
                <span className={iconShellClass}>
                  <Code2 className="size-4" />
                </span>
                <span className="flex-1">Brok Code</span>
                {isCodeActive ? (
                  <span className="nav-live-dot" aria-hidden />
                ) : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="BrokCode TUI"
              className={navButtonClass}
              isActive={isActive('/brokcode/tui')}
            >
              <Link href="/brokcode/tui" className="flex items-center gap-2">
                <span className={iconShellClass}>
                  <TerminalSquare className="size-4" />
                </span>
                <span className="flex-1">TUI</span>
                {isActive('/brokcode/tui') ? (
                  <span className="nav-live-dot" aria-hidden />
                ) : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Playground"
              className={navButtonClass}
              isActive={isActive('/playground')}
            >
              <Link href="/playground" className="flex items-center gap-2">
                <span className={iconShellClass}>
                  <FlaskConical className="size-4" />
                </span>
                <span className="flex-1">Playground</span>
                {isActive('/playground') ? (
                  <span className="nav-live-dot" aria-hidden />
                ) : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Presentations"
              className={navButtonClass}
              isActive={isActive('/presentations')}
            >
              <Link href="/presentations" className="flex items-center gap-2">
                <span className={iconShellClass}>
                  <Presentation className="size-4" />
                </span>
                <span className="flex-1">Slides</span>
                {isActive('/presentations') ? (
                  <span className="nav-live-dot" aria-hidden />
                ) : null}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Integrations"
              className={navButtonClass}
              isActive={isActive('/integrations')}
            >
              <Link href="/integrations" className="flex items-center gap-2">
                <span className={iconShellClass}>
                  <PlugZap className="size-4" />
                </span>
                <span className="flex-1">Integrations</span>
                {isActive('/integrations') ? (
                  <span className="nav-live-dot" aria-hidden />
                ) : null}
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
