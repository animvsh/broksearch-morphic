'use client'

import { useEffect, useId, useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

function Eye({
  x,
  blink,
  pupilShiftX = 0
}: {
  x: number
  blink?: boolean
  pupilShiftX?: number
}) {
  return (
    <g transform={`translate(${x} 124)`}>
      <ellipse
        cx="0"
        cy="0"
        rx="20"
        ry={blink ? 4 : 20}
        fill="white"
        className={cn('transition-all duration-200')}
      />
      <circle
        cx={Math.max(-4, Math.min(4, pupilShiftX))}
        cy="0"
        r={blink ? 1.5 : 5}
        fill="black"
        className={cn('transition-all duration-200')}
      />
      <circle
        cx={Math.max(-4, Math.min(4, pupilShiftX)) + 1.5}
        cy={-1.5}
        r="1.2"
        fill="white"
        opacity={blink ? 0 : 0.85}
        className={cn('transition-all duration-200')}
      />
    </g>
  )
}

function Spark({
  x,
  y,
  size = 8,
  className
}: {
  x: number
  y: number
  size?: number
  className?: string
}) {
  return (
    <path
      d={`M ${x} ${y - size} L ${x + size * 0.34} ${y - size * 0.34} L ${x + size} ${y} L ${x + size * 0.34} ${y + size * 0.34} L ${x} ${y + size} L ${x - size * 0.34} ${y + size * 0.34} L ${x - size} ${y} L ${x - size * 0.34} ${y - size * 0.34} Z`}
      fill="rgba(255,255,255,0.92)"
      className={className}
    />
  )
}

function BrandOrb({
  gradientId,
  coreGradientId
}: {
  gradientId: string
  coreGradientId: string
}) {
  return (
    <>
      <circle cx="128" cy="128" r="124" fill={`url(#${gradientId})`} />
      <circle
        cx="128"
        cy="128"
        r="118"
        fill="rgba(255,255,255,0.16)"
        opacity="0.32"
      />
      <circle cx="128" cy="128" r="114" fill={`url(#${coreGradientId})`} />
      <circle
        cx="128"
        cy="128"
        r="97"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="2.5"
      />
      <path
        d="M58 104c14-39 52-66 97-66 23 0 43 5 60 16"
        fill="none"
        stroke="rgba(255,255,255,0.14)"
        strokeLinecap="round"
        strokeWidth="10"
      />
    </>
  )
}

function BrandFace({
  blink,
  pupilShiftX = 0
}: {
  blink?: boolean
  pupilShiftX?: number
}) {
  return (
    <>
      <Eye x={96} blink={blink} pupilShiftX={pupilShiftX} />
      <Eye x={160} blink={blink} pupilShiftX={pupilShiftX} />
      <path
        d="M80 170c14 15 31 22 48 22s34-7 48-22"
        fill="none"
        stroke="rgba(255,255,255,0.82)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M90 174c11 8 24 12 38 12s27-4 38-12"
        fill="none"
        stroke="rgba(255,201,126,0.48)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </>
  )
}

function IconLogo({ className, ...props }: React.ComponentProps<'svg'>) {
  const gradientId = useId()
  const coreGradientId = useId()

  return (
    <svg
      viewBox="0 0 256 256"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('size-4', className)}
      {...props}
    >
      <defs>
        <linearGradient id={gradientId} x1="36" y1="24" x2="220" y2="232">
          <stop offset="0%" stopColor="#ff6a3d" />
          <stop offset="44%" stopColor="#ffcc66" />
          <stop offset="76%" stopColor="#8b7cff" />
          <stop offset="100%" stopColor="#24c8ff" />
        </linearGradient>
        <radialGradient id={coreGradientId} cx="35%" cy="25%" r="80%">
          <stop offset="0%" stopColor="#1c2032" />
          <stop offset="100%" stopColor="#0b0f18" />
        </radialGradient>
      </defs>

      <BrandOrb gradientId={gradientId} coreGradientId={coreGradientId} />
      <path
        d="M58 128c8-44 43-78 86-83"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeLinecap="round"
        strokeWidth="6"
      />
      <BrandFace />
      <Spark x={198} y={72} size={7} />
    </svg>
  )
}

function IconLogoOutline({ className, ...props }: React.ComponentProps<'svg'>) {
  const gradientId = useId()

  return (
    <svg
      viewBox="0 0 256 256"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('size-4', className)}
      {...props}
    >
      <defs>
        <linearGradient id={gradientId} x1="36" y1="24" x2="220" y2="232">
          <stop offset="0%" stopColor="#ff6a3d" />
          <stop offset="44%" stopColor="#ffcc66" />
          <stop offset="76%" stopColor="#8b7cff" />
          <stop offset="100%" stopColor="#24c8ff" />
        </linearGradient>
      </defs>
      <circle
        cx="128"
        cy="128"
        r="108"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="24"
      />
      <path
        d="M54 128c9-38 38-67 78-78"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeLinecap="round"
        strokeWidth="8"
      />
      <circle cx="102" cy="128" r="18" fill="currentColor" />
      <circle cx="154" cy="128" r="18" fill="currentColor" />
      <path
        d="M88 172c11 12 24 18 40 18s29-6 40-18"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="10"
      />
    </svg>
  )
}

function IconBlinkingLogo({
  animate = true,
  className,
  ...props
}: React.ComponentProps<'svg'> & {
  animate?: boolean
}) {
  const gradientId = useId()
  const coreGradientId = useId()
  const [isBlinking, setIsBlinking] = useState(false)
  const [pupilShiftX, setPupilShiftX] = useState(0)
  const displayedPupilShiftX = animate ? pupilShiftX : 0
  const glanceTargets = useMemo(() => [-4, -2, 0, 2, 4], [])

  useEffect(() => {
    if (!animate) {
      return
    }

    let blinkTimeout: ReturnType<typeof setTimeout> | undefined
    let unblinkTimeout: ReturnType<typeof setTimeout> | undefined

    const scheduleBlink = () => {
      const delay = Math.random() * 4000 + 1600
      blinkTimeout = setTimeout(() => {
        setIsBlinking(true)
        unblinkTimeout = setTimeout(() => {
          setIsBlinking(false)
          scheduleBlink()
        }, 160)
      }, delay)
    }

    scheduleBlink()

    return () => {
      if (blinkTimeout) clearTimeout(blinkTimeout)
      if (unblinkTimeout) clearTimeout(unblinkTimeout)
    }
  }, [animate])

  useEffect(() => {
    if (!animate) {
      return
    }

    const interval = window.setInterval(() => {
      const next =
        glanceTargets[Math.floor(Math.random() * glanceTargets.length)]
      setPupilShiftX(next ?? 0)
    }, 1600)
    return () => window.clearInterval(interval)
  }, [animate, glanceTargets])

  return (
    <svg
      viewBox="0 0 256 256"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('size-4', animate && 'animate-logo-float', className)}
      {...props}
    >
      <defs>
        <linearGradient id={gradientId} x1="36" y1="24" x2="220" y2="232">
          <stop offset="0%" stopColor="#ff6a3d" />
          <stop offset="44%" stopColor="#ffcc66" />
          <stop offset="76%" stopColor="#8b7cff" />
          <stop offset="100%" stopColor="#24c8ff" />
        </linearGradient>
        <radialGradient id={coreGradientId} cx="35%" cy="25%" r="80%">
          <stop offset="0%" stopColor="#1e2233" />
          <stop offset="100%" stopColor="#0b0f18" />
        </radialGradient>
      </defs>
      <BrandOrb gradientId={gradientId} coreGradientId={coreGradientId} />
      <path
        d="M58 128c8-44 43-78 86-83"
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeLinecap="round"
        strokeWidth="6"
      />
      <BrandFace blink={isBlinking} pupilShiftX={displayedPupilShiftX} />
      <g className={cn(animate && 'animate-brand-orbit')}>
        <Spark
          x={198}
          y={72}
          size={7}
          className={cn(animate && 'animate-brand-sparkle')}
        />
      </g>
    </svg>
  )
}

export { IconBlinkingLogo, IconLogo, IconLogoOutline }
