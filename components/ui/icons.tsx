'use client'

import { cn } from '@/lib/utils'

type LogoImageProps = Omit<React.ComponentProps<'img'>, 'alt' | 'src'> & {
  animate?: boolean
}

function BrokLogoImage({ animate, className, ...props }: LogoImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/brok-logo.png"
      alt="Brok"
      className={cn(
        'size-4 object-contain',
        animate && 'animate-logo-pulse',
        className
      )}
      draggable={false}
      {...props}
    />
  )
}

function IconLogo({ className, ...props }: LogoImageProps) {
  return <BrokLogoImage className={className} {...props} />
}

function IconLogoOutline({ className, ...props }: LogoImageProps) {
  return <BrokLogoImage className={className} {...props} />
}

function IconBlinkingLogo({
  animate = true,
  className,
  ...props
}: LogoImageProps) {
  return <BrokLogoImage animate={animate} className={className} {...props} />
}

export { IconBlinkingLogo, IconLogo, IconLogoOutline }
