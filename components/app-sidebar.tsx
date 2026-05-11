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
    'group/sidebar relative h-10 rounded-2xl border border-transparent px-2.5 text-[13px] font-medium text-sidebar-foreground/68 transition-all duration-200 hover:-translate-y-0.5 hover:border-border/75 hover:bg-background/82 hover:text-sidebar-foreground hover:shadow-[0_18px_40px_-30px_rgba(15,23,42,0.34)] data-[active=true]:border-border/80 data-[active=true]:bg-background/92 data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-[0_20px_42px_-30px_rgba(15,23,42,0.36)]'
  const subButtonClass =
    'group/subnav rounded-2xl border border-transparent px-2 text-sidebar-foreground/58 transition-all duration-200 hover:border-border/65 hover:bg-background/74 hover:text-sidebar-foreground data-[active=true]:border-border/70 data-[active=true]:bg-background/88 data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-[0_14px_28px_-24px_rgba(15,23,42,0.34)]'
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
      className="border-r border-sidebar-border/75 bg-sidebar/92 text-sidebar-foreground shadow-sm backdrop-blur-xl"
    >
      <SidebarHeader className="flex flex-row items-center justify-between border-b border-sidebar-border/70">
        <Link href="/" className="flex items-center gap-2 px-2 py-3">
          <span className="brand-badge brand-halo rounded-full p-1.5">
            <IconBlinkingLogo className={cn('size-5')} />
          </span>
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="brand-gradient-text brand-wordmark truncate text-sm font-semibold">
              brok
            </span>
            <span className="sidebar-section-label text-[10px] font-medium leading-none">
              search, build, ship
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
                <span className="flex size-7 items-center justify-center rounded-xl border border-border/65 bg-background/70 text-foreground/80 transition-all duration-200 group-hover/sidebar:border-border/85 group-hover/sidebar:bg-background group-hover/sidebar:text-foreground">
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
                <span className="flex size-7 items-center justify-center rounded-xl border border-border/65 bg-background/70 text-foreground/80 transition-all duration-200 group-data-[active=true]/sidebar:border-transparent group-data-[active=true]/sidebar:bg-gradient-to-br group-data-[active=true]/sidebar:from-orange-400/90 group-data-[active=true]/sidebar:via-amber-300/85 group-data-[active=true]/sidebar:to-sky-400/90 group-data-[active=true]/sidebar:text-slate-950 group-hover/sidebar:border-border/85 group-hover/sidebar:bg-background group-hover/sidebar:text-foreground">
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
                    <span className="flex size-6 items-center justify-center rounded-xl border border-border/65 bg-background/68 transition-all duration-200 group-data-[active=true]/subnav:border-border/80 group-data-[active=true]/subnav:bg-background/90">
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
                    <span className="flex size-6 items-center justify-center rounded-xl border border-border/65 bg-background/68 transition-all duration-200 group-data-[active=true]/subnav:border-border/80 group-data-[active=true]/subnav:bg-background/90">
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
                    <span className="flex size-6 items-center justify-center rounded-xl border border-border/65 bg-background/68 transition-all duration-200 group-data-[active=true]/subnav:border-border/80 group-data-[active=true]/subnav:bg-background/90">
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
                <span className="flex size-7 items-center justify-center rounded-xl border border-border/65 bg-background/70 text-foreground/80 transition-all duration-200 group-data-[active=true]/sidebar:border-transparent group-data-[active=true]/sidebar:bg-gradient-to-br group-data-[active=true]/sidebar:from-orange-400/90 group-data-[active=true]/sidebar:via-amber-300/85 group-data-[active=true]/sidebar:to-sky-400/90 group-data-[active=true]/sidebar:text-slate-950 group-hover/sidebar:border-border/85 group-hover/sidebar:bg-background group-hover/sidebar:text-foreground">
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
                <span className="flex size-7 items-center justify-center rounded-xl border border-border/65 bg-background/70 text-foreground/80 transition-all duration-200 group-data-[active=true]/sidebar:border-transparent group-data-[active=true]/sidebar:bg-gradient-to-br group-data-[active=true]/sidebar:from-orange-400/90 group-data-[active=true]/sidebar:via-amber-300/85 group-data-[active=true]/sidebar:to-sky-400/90 group-data-[active=true]/sidebar:text-slate-950 group-hover/sidebar:border-border/85 group-hover/sidebar:bg-background group-hover/sidebar:text-foreground">
                  <Code2 className="size-4" />
                </span>
                <span className="flex-1">Code</span>
                {isCodeActive ? <span className="nav-live-dot" aria-hidden /> : null}
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
                <span className="flex size-7 items-center justify-center rounded-xl border border-border/65 bg-background/70 text-foreground/80 transition-all duration-200 group-data-[active=true]/sidebar:border-transparent group-data-[active=true]/sidebar:bg-gradient-to-br group-data-[active=true]/sidebar:from-orange-400/90 group-data-[active=true]/sidebar:via-amber-300/85 group-data-[active=true]/sidebar:to-sky-400/90 group-data-[active=true]/sidebar:text-slate-950 group-hover/sidebar:border-border/85 group-hover/sidebar:bg-background group-hover/sidebar:text-foreground">
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
                <span className="flex size-7 items-center justify-center rounded-xl border border-border/65 bg-background/70 text-foreground/80 transition-all duration-200 group-data-[active=true]/sidebar:border-transparent group-data-[active=true]/sidebar:bg-gradient-to-br group-data-[active=true]/sidebar:from-orange-400/90 group-data-[active=true]/sidebar:via-amber-300/85 group-data-[active=true]/sidebar:to-sky-400/90 group-data-[active=true]/sidebar:text-slate-950 group-hover/sidebar:border-border/85 group-hover/sidebar:bg-background group-hover/sidebar:text-foreground">
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
                <span className="flex size-7 items-center justify-center rounded-xl border border-border/65 bg-background/70 text-foreground/80 transition-all duration-200 group-data-[active=true]/sidebar:border-transparent group-data-[active=true]/sidebar:bg-gradient-to-br group-data-[active=true]/sidebar:from-orange-400/90 group-data-[active=true]/sidebar:via-amber-300/85 group-data-[active=true]/sidebar:to-sky-400/90 group-data-[active=true]/sidebar:text-slate-950 group-hover/sidebar:border-border/85 group-hover/sidebar:bg-background group-hover/sidebar:text-foreground">
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
                <span className="flex size-7 items-center justify-center rounded-xl border border-border/65 bg-background/70 text-foreground/80 transition-all duration-200 group-data-[active=true]/sidebar:border-transparent group-data-[active=true]/sidebar:bg-gradient-to-br group-data-[active=true]/sidebar:from-orange-400/90 group-data-[active=true]/sidebar:via-amber-300/85 group-data-[active=true]/sidebar:to-sky-400/90 group-data-[active=true]/sidebar:text-slate-950 group-hover/sidebar:border-border/85 group-hover/sidebar:bg-background group-hover/sidebar:text-foreground">
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
