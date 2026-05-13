import { formatOAuthErrorMessage } from '@/lib/auth/oauth-errors'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function Page({
  searchParams
}: {
  searchParams: Promise<{
    error?: string
    error_code?: string
    msg?: string
  }>
}) {
  const params = await searchParams
  const rawError = params?.msg || params?.error || params?.error_code

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                Sorry, something went wrong.
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rawError ? (
                <p className="text-sm text-muted-foreground">
                  {formatOAuthErrorMessage(rawError)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  An unspecified error occurred.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
