import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ArrowRight, Code2, Mail, Search, ShieldCheck } from 'lucide-react'

import { getAppAccessForUser, hasFeatureAccess } from '@/lib/auth/app-access'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getModelSelectorData } from '@/lib/model-selector/get-model-selector-data'

import { Button } from '@/components/ui/button'
import { SearchLanding } from '@/components/search/search-landing'

export default async function Page() {
  const user = await getCurrentUser()
  const access = await getAppAccessForUser(user)
  const isCloudDeployment = process.env.BROK_CLOUD_DEPLOYMENT === 'true'

  if (!access.allowed) {
    return <BrokLanding isSignedIn={Boolean(user)} />
  }

  if (!hasFeatureAccess(access, 'search')) {
    if (hasFeatureAccess(access, 'brokcode')) redirect('/brokcode')
    if (hasFeatureAccess(access, 'brokmail')) redirect('/brokmail')
    if (hasFeatureAccess(access, 'tools')) redirect('/tools')
    if (hasFeatureAccess(access, 'api_platform')) redirect('/playground')

    return <BrokLanding isSignedIn={Boolean(user)} />
  }

  const modelSelectorData = await getModelSelectorData()

  return (
    <SearchLanding
      isCloudDeployment={isCloudDeployment}
      hasModels={modelSelectorData?.hasAvailableModels !== false}
    />
  )
}

function BrokLanding({ isSignedIn }: { isSignedIn: boolean }) {
  const primaryHref = isSignedIn ? '/auth/access-pending' : '/auth/login'

  return (
    <main className="min-h-full bg-background">
      <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl flex-col justify-center px-5 py-12 sm:px-8">
        <div className="max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted/30 px-3 py-1 text-sm text-muted-foreground">
            <ShieldCheck className="size-4" />
            Private beta
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Brok
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
            A private AI workspace for search, email, connected tools, and
            BrokCode. Access is limited to approved accounts while the platform
            is being hardened.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link href={primaryHref}>
                {isSignedIn ? 'Request access' : 'Sign in'}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/docs">Read docs</Link>
            </Button>
          </div>
        </div>

        <div className="mt-12 grid gap-3 md:grid-cols-3">
          {[
            {
              title: 'Research',
              body: 'Fast answers with citations, source review, and deep research jobs.',
              icon: Search
            },
            {
              title: 'BrokMail',
              body: 'Connected Gmail workflows for triage, drafting, and safe actions.',
              icon: Mail
            },
            {
              title: 'BrokCode',
              body: 'A coding-agent workspace for browser, cloud, and TUI workflows.',
              icon: Code2
            }
          ].map(item => {
            const Icon = item.icon

            return (
              <div
                key={item.title}
                className="rounded-lg border border-border/70 bg-card/70 p-5"
              >
                <Icon className="mb-4 size-5 text-muted-foreground" />
                <h2 className="font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.body}
                </p>
              </div>
            )
          })}
        </div>
      </section>
    </main>
  )
}
