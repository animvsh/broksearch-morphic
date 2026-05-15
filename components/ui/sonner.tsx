'use client'

import { Toaster as Sonner } from 'sonner'

import { useTheme } from '@/components/theme-provider'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      position="top-right"
      richColors
      closeButton
      expand={false}
      visibleToasts={4}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:max-w-[min(360px,calc(100vw-2rem))] group-[.toaster]:rounded-xl group-[.toaster]:border-border/75 group-[.toaster]:bg-background/95 group-[.toaster]:text-foreground group-[.toaster]:shadow-[0_18px_60px_-42px_rgba(15,23,42,0.45)] group-[.toaster]:backdrop-blur group-[.toaster]:[overflow-wrap:anywhere]',
          description:
            'group-[.toast]:text-muted-foreground group-[.toast]:[overflow-wrap:anywhere]',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
