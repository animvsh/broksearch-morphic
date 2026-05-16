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
  PenLine,
  PlugZap,
  Plus,
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
    'group/sidebar relative h-8 rounded-lg border border-transparent px-2 text-[13px] font-medium text-zinc-500 transition-all duration-150 hover:bg-zinc-100/80 hover:text-zinc-950 data-[active=true]:border-zinc-200/80 data-[active=true]:bg-white data-[active=true]:text-zinc-950'
  const subButtonClass =
    'group/subnav h-7 rounded-lg border border-transparent px-2 text-[12px] text-zinc-400 transition-all duration-150 hover:bg-zinc-100/80 hover:text-zinc-950 data-[active=true]:bg-white data-[active=true]:text-zinc-950'
  const iconShellClass =
    'flex size-6 items-center justify-center rounded-md border border-transparent text-zinc-400 transition-all duration-150 group-data-[active=true]/sidebar:bg-zinc-950 group-data-[active=true]/sidebar:text-white group-hover/sidebar:bg-white group-hover/sidebar:text-zinc-900'
  const subIconShellClass =
    'flex size-6 items-center justify-center rounded-lg border border-transparent text-zinc-400 transition-colors duration-100 group-data-[active=true]/subnav:bg-zinc-900 group-data-[active=true]/subnav:text-white group-hover/subnav:bg-white group-hover/subnav:text-zinc-900'
  const isActive = (href: string) =>
    href === '/'
      ? pathname === '/'
      : pathname === href || pathname.startsWith(`${href}/`)
  const isCodeActive =
    pathname.startsWith('/brokcode') && !pathname.startsWith('/brokcode/tui')
  const isBrokCodeGroupActive =
    pathname.startsWith('/brokcode') || pathname.startsWith('/playground')

  return (
    <Sidebar
      side="left"
      variant="sidebar"
      collapsible="icon"
      className="border-r border-zinc-200/80 bg-white/95 text-zinc-950 shadow-none backdrop-blur-md"
    >
      <SidebarHeader className="flex flex-row items-center justify-between border-b border-zinc-200/80 bg-white/95 backdrop-blur-md">
        <Link href="/" className="flex items-center gap-2 px-2 py-2.5">
          <span className="brand-mark rounded-full p-1.5">
            <IconBlinkingLogo className={cn('size-5')} />
          </span>
          <span className="brand-wordmark truncate text-sm font-semibold text-zinc-950 group-data-[collapsible=icon]:hidden">
            brok
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="flex h-full flex-col px-2 py-2.5">
        <SidebarMenu className="gap-1">
          <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 group-data-[collapsible=icon]:hidden">
            Search
          </div>
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
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </SidebarMenuItem>
          <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 group-data-[collapsible=icon]:hidden">
            Products
          </div>
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
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Brok Code"
              className={navButtonClass}
              isActive={isBrokCodeGroupActive}
            >
              <Link href="/brokcode" className="flex items-center gap-2">
                <span className={iconShellClass}>
                  <Code2 className="size-4" />
                </span>
                <span className="flex-1">Brok Code</span>
              </Link>
            </SidebarMenuButton>
            <SidebarMenuSub>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  asChild
                  size="sm"
                  className={subButtonClass}
                  isActive={isCodeActive}
                >
                  <Link href="/brokcode" className="flex items-center gap-2">
                    <span className={subIconShellClass}>
                      <Code2 className="size-4" />
                    </span>
                    <span className="flex-1">Builder</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  asChild
                  size="sm"
                  className={subButtonClass}
                  isActive={isActive('/playground')}
                >
                  <Link href="/playground" className="flex items-center gap-2">
                    <span className={subIconShellClass}>
                      <FlaskConical className="size-4" />
                    </span>
                    <span className="flex-1">API</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  asChild
                  size="sm"
                  className={subButtonClass}
                  isActive={isActive('/brokcode/tui')}
                >
                  <Link
                    href="/brokcode/tui"
                    className="flex items-center gap-2"
                  >
                    <span className={subIconShellClass}>
                      <TerminalSquare className="size-4" />
                    </span>
                    <span className="flex-1">TUI</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            </SidebarMenuSub>
          </SidebarMenuItem>
          <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 group-data-[collapsible=icon]:hidden">
            Workspace
          </div>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Tools"
              className={navButtonClass}
              isActive={isActive('/tools')}
            >
              <Link href="/tools" className="flex items-center gap-2">
                <span className={iconShellClass}>
                  <PenLine className="size-4" />
                </span>
                <span className="flex-1">Tools</span>
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
