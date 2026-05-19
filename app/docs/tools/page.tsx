import Link from 'next/link'

export default function ToolsDocsPage() {
  return (
    <div className="container max-w-3xl py-8">
      <h1 className="mb-4 text-4xl font-bold">Tools</h1>
      <p className="mb-8 text-xl text-muted-foreground">
        Brok Tools are focused utilities backed by the same account, usage, and
        admin controls as the rest of the platform.
      </p>

      <div className="prose prose-neutral dark:prose-invert">
        <h2>Humanizer</h2>
        <p>
          Humanizer rewrites AI-looking text into cleaner prose. It supports a
          voice sample so rewrites can match a user-provided writing rhythm
          instead of producing generic polished copy.
        </p>

        <h2>Feature request widget</h2>
        <p>
          The fixed widget collects product feedback with the signed-in account
          attached when available. Admins can review requests from the admin
          queue.
        </p>

        <h2>Routes</h2>
        <ul>
          <li>
            <Link href="/tools">Tools index</Link>
          </li>
          <li>
            <Link href="/tools/humanizer">Humanizer</Link>
          </li>
          <li>
            <Link href="/admin">Admin request queue</Link>
          </li>
        </ul>
      </div>
    </div>
  )
}
