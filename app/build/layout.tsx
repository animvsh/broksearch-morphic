import type { ReactNode } from 'react'

export default function BrokBuildLayout({ children }: { children: ReactNode }) {
  return <div className="flex h-[calc(100vh-64px)] w-full flex-col">{children}</div>
}
