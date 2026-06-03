'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  Activity,
  BookOpen,
  Building2,
  Code2,
  Compass,
  FlaskConical,
  FolderKanban,
  KeyRound,
  LayoutGrid,
  ListTree,
  Mail,
  PanelLeft,
  PenLine,
  PlugZap,
  Plus,
  Presentation,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Users
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

export default function AppSidebar({ isAdmin = false }: { isAdmin?: boolean }) {
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
  const isBuildActive = pathname === '/build' || pathname.startsWith('/build/')
  const isApiManagerActive = pathname.startsWith('/api-platform/')

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
              tooltip="Presentations"
              className={navButtonClass}
              isActive={isActive('/presentations')}
            >
              <Link href="/presentations" className="flex items-center gap-2">
                <span className={iconShellClass}>
                  <Presentation className="size-4" />
                </span>
                <span className="flex-1">Presentations</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Build"
              className={navButtonClass}
              isActive={isBuildActive}
            >
              <Link href="/build" className="flex items-center gap-2">
                <span className={iconShellClass}>
                  <Sparkles className="size-4" />
                </span>
                <span className="flex-1">Build</span>
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
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="API Manager"
              className={navButtonClass}
              isActive={isApiManagerActive}
            >
              <Link
                href="/api-platform/keys"
                className="flex items-center gap-2"
              >
                <span className={iconShellClass}>
                  <KeyRound className="size-4" />
                </span>
                <span className="flex-1">API Manager</span>
              </Link>
            </SidebarMenuButton>
            <SidebarMenuSub>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  asChild
                  size="sm"
                  className={subButtonClass}
                  isActive={isActive('/api-platform/keys')}
                >
                  <Link
                    href="/api-platform/keys"
                    className="flex items-center gap-2"
                  >
                    <span className={subIconShellClass}>
                      <KeyRound className="size-4" />
                    </span>
                    <span className="flex-1">API Keys</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  asChild
                  size="sm"
                  className={subButtonClass}
                  isActive={isActive('/api-platform/usage')}
                >
                  <Link
                    href="/api-platform/usage"
                    className="flex items-center gap-2"
                  >
                    <span className={subIconShellClass}>
                      <Activity className="size-4" />
                    </span>
                    <span className="flex-1">Usage</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  asChild
                  size="sm"
                  className={subButtonClass}
                  isActive={isActive('/api-platform/logs')}
                >
                  <Link
                    href="/api-platform/logs"
                    className="flex items-center gap-2"
                  >
                    <span className={subIconShellClass}>
                      <ScrollText className="size-4" />
                    </span>
                    <span className="flex-1">Logs</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  asChild
                  size="sm"
                  className={subButtonClass}
                  isActive={isActive('/api-platform/playground')}
                >
                  <Link
                    href="/api-platform/playground"
                    className="flex items-center gap-2"
                  >
                    <span className={subIconShellClass}>
                      <FlaskConical className="size-4" />
                    </span>
                    <span className="flex-1">Playground</span>
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
          {isAdmin ? (
            <>
              <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400 group-data-[collapsible=icon]:hidden">
                Admin
              </div>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Admin"
                  className={navButtonClass}
                  isActive={isActive('/admin')}
                >
                  <Link href="/admin" className="flex items-center gap-2">
                    <span className={iconShellClass}>
                      <ShieldCheck className="size-4" />
                    </span>
                    <span className="flex-1">Admin Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Users"
                  className={navButtonClass}
                  isActive={isActive('/admin/users')}
                >
                  <Link href="/admin/users" className="flex items-center gap-2">
                    <span className={iconShellClass}>
                      <Users className="size-4" />
                    </span>
                    <span className="flex-1">Users</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Workspaces"
                  className={navButtonClass}
                  isActive={isActive('/admin/workspaces')}
                >
                  <Link
                    href="/admin/workspaces"
                    className="flex items-center gap-2"
                  >
                    <span className={iconShellClass}>
                      <Building2 className="size-4" />
                    </span>
                    <span className="flex-1">Workspaces</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Search admin"
                  className={navButtonClass}
                  isActive={isActive('/admin/search')}
                >
                  <Link
                    href="/admin/search"
                    className="flex items-center gap-2"
                  >
                    <span className={iconShellClass}>
                      <Search className="size-4" />
                    </span>
                    <span className="flex-1">Search</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="All projects"
                  className={navButtonClass}
                  isActive={isActive('/admin/projects')}
                >
                  <Link
                    href="/admin/projects"
                    className="flex items-center gap-2"
                  >
                    <span className={iconShellClass}>
                      <FolderKanban className="size-4" />
                    </span>
                    <span className="flex-1">All Projects</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Global logs"
                  className={navButtonClass}
                  isActive={isActive('/admin/logs')}
                >
                  <Link href="/admin/logs" className="flex items-center gap-2">
                    <span className={iconShellClass}>
                      <ListTree className="size-4" />
                    </span>
                    <span className="flex-1">Global Logs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Audit"
                  className={navButtonClass}
                  isActive={isActive('/admin/health')}
                >
                  <Link
                    href="/admin/health"
                    className="flex items-center gap-2"
                  >
                    <span className={iconShellClass}>
                      <ShieldCheck className="size-4" />
                    </span>
                    <span className="flex-1">Audit</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Costs"
                  className={navButtonClass}
                  isActive={isActive('/admin/costs')}
                >
                  <Link href="/admin/costs" className="flex items-center gap-2">
                    <span className={iconShellClass}>
                      <ScrollText className="size-4" />
                    </span>
                    <span className="flex-1">Costs</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="App Builder Admin"
                  className={navButtonClass}
                  isActive={isActive('/admin/app-builder')}
                >
                  <Link
                    href="/admin/app-builder"
                    className="flex items-center gap-2"
                  >
                    <span className={iconShellClass}>
                      <Code2 className="size-4" />
                    </span>
                    <span className="flex-1">App Builder</span>
                  </Link>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      size="sm"
                      className={subButtonClass}
                      isActive={isActive('/admin/app-builder/projects')}
                    >
                      <Link
                        href="/admin/app-builder/projects"
                        className="flex items-center gap-2"
                      >
                        <span className={subIconShellClass}>
                          <LayoutGrid className="size-4" />
                        </span>
                        <span className="flex-1">Projects</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      size="sm"
                      className={subButtonClass}
                      isActive={isActive('/admin/app-builder/generations')}
                    >
                      <Link
                        href="/admin/app-builder/generations"
                        className="flex items-center gap-2"
                      >
                        <span className={subIconShellClass}>
                          <FlaskConical className="size-4" />
                        </span>
                        <span className="flex-1">Generations</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      size="sm"
                      className={subButtonClass}
                      isActive={isActive('/admin/app-builder/builds')}
                    >
                      <Link
                        href="/admin/app-builder/builds"
                        className="flex items-center gap-2"
                      >
                        <span className={subIconShellClass}>
                          <TerminalSquare className="size-4" />
                        </span>
                        <span className="flex-1">Builds</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      size="sm"
                      className={subButtonClass}
                      isActive={isActive('/admin/app-builder/costs')}
                    >
                      <Link
                        href="/admin/app-builder/costs"
                        className="flex items-center gap-2"
                      >
                        <span className={subIconShellClass}>
                          <PenLine className="size-4" />
                        </span>
                        <span className="flex-1">Costs</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Presentations Admin"
                  className={navButtonClass}
                  isActive={isActive('/admin/presentations')}
                >
                  <Link
                    href="/admin/presentations"
                    className="flex items-center gap-2"
                  >
                    <span className={iconShellClass}>
                      <Presentation className="size-4" />
                    </span>
                    <span className="flex-1">Presentations</span>
                  </Link>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      size="sm"
                      className={subButtonClass}
                      isActive={isActive('/admin/presentations/decks')}
                    >
                      <Link
                        href="/admin/presentations/decks"
                        className="flex items-center gap-2"
                      >
                        <span className={subIconShellClass}>
                          <LayoutGrid className="size-4" />
                        </span>
                        <span className="flex-1">Decks</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      size="sm"
                      className={subButtonClass}
                      isActive={isActive('/admin/presentations/generations')}
                    >
                      <Link
                        href="/admin/presentations/generations"
                        className="flex items-center gap-2"
                      >
                        <span className={subIconShellClass}>
                          <FlaskConical className="size-4" />
                        </span>
                        <span className="flex-1">Generations</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      size="sm"
                      className={subButtonClass}
                      isActive={isActive('/admin/presentations/themes')}
                    >
                      <Link
                        href="/admin/presentations/themes"
                        className="flex items-center gap-2"
                      >
                        <span className={subIconShellClass}>
                          <PanelLeft className="size-4" />
                        </span>
                        <span className="flex-1">Themes</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton
                      asChild
                      size="sm"
                      className={subButtonClass}
                      isActive={isActive('/admin/presentations/costs')}
                    >
                      <Link
                        href="/admin/presentations/costs"
                        className="flex items-center gap-2"
                      >
                        <span className={subIconShellClass}>
                          <PenLine className="size-4" />
                        </span>
                        <span className="flex-1">Costs</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </SidebarMenuItem>
            </>
          ) : null}
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
