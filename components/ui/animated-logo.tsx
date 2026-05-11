'use client'

import { cn } from '@/lib/utils'

import { IconBlinkingLogo } from '@/components/ui/icons'

export function AnimatedLogo({
  animate = true,
  className,
  ...props
}: React.ComponentProps<'svg'> & {
  animate?: boolean
}) {
  return (
    <IconBlinkingLogo
      animate={animate}
      className={cn('size-8', className)}
      {...props}
    />
  )
}
