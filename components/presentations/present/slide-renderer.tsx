'use client'

import Image from 'next/image'

import { type SlideContent } from '@/lib/presentations/theme-utils'
import { type Theme } from '@/lib/presentations/themes'
import { cn } from '@/lib/utils'

interface SlideRendererProps {
  slide: SlideContent
  theme: Theme
  isActive?: boolean
}

function isGradient(background: string): boolean {
  return background.startsWith('linear-gradient')
}

function TitleLayout({ slide, theme }: { slide: SlideContent; theme: Theme }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-16 text-center">
      {slide.heading && (
        <h1
          className="text-6xl font-bold leading-tight"
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.heading
          }}
        >
          {slide.heading}
        </h1>
      )}
      {slide.body?.map((item, i) => (
        <p
          key={i}
          className="text-2xl"
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.body,
            opacity: 0.8
          }}
        >
          {item.content}
        </p>
      ))}
      {slide.stats && (
        <div className="mt-8 flex gap-12">
          {slide.stats.map((stat, i) => (
            <div key={i} className="text-center">
              <div
                className="text-5xl font-bold"
                style={{ color: theme.colors.accent }}
              >
                {stat.value}
              </div>
              <div
                className="mt-2 text-lg"
                style={{ color: theme.colors.text, opacity: 0.7 }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SectionLayout({
  slide,
  theme
}: {
  slide: SlideContent
  theme: Theme
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 p-16 text-center">
      {slide.heading && (
        <div
          className="text-sm uppercase tracking-widest"
          style={{ color: theme.colors.accent, fontFamily: theme.fonts.body }}
        >
          Section
        </div>
      )}
      {slide.heading && (
        <h2
          className="text-5xl font-bold"
          style={{ color: theme.colors.text, fontFamily: theme.fonts.heading }}
        >
          {slide.heading}
        </h2>
      )}
      {slide.body?.map((item, i) => (
        <p
          key={i}
          className="mt-4 max-w-2xl text-xl"
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.body,
            opacity: 0.75
          }}
        >
          {item.content}
        </p>
      ))}
    </div>
  )
}

function TwoColumnLayout({
  slide,
  theme
}: {
  slide: SlideContent
  theme: Theme
}) {
  const bullets = slide.bullets ?? slide.body?.map(b => b.content) ?? []

  return (
    <div className="flex h-full w-full gap-12 p-16">
      {/* Left column - heading */}
      <div className="flex w-1/2 flex-col justify-center">
        {slide.heading && (
          <h2
            className="text-4xl font-bold leading-tight"
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.heading
            }}
          >
            {slide.heading}
          </h2>
        )}
        {slide.quote && (
          <blockquote
            className="mt-6 border-l-4 pl-4 text-xl italic"
            style={{
              borderColor: theme.colors.accent,
              color: theme.colors.text,
              fontFamily: theme.fonts.body,
              opacity: 0.8
            }}
          >
            {slide.quote}
            {slide.quoteAttribution && (
              <footer
                className="mt-2 text-sm not-italic"
                style={{ opacity: 0.6 }}
              >
                — {slide.quoteAttribution}
              </footer>
            )}
          </blockquote>
        )}
      </div>

      {/* Right column - bullets */}
      <div className="flex w-1/2 flex-col justify-center">
        {bullets.length > 0 && (
          <ul className="space-y-4">
            {bullets.map((text, i) => (
              <li key={i} className="flex items-start gap-3">
                <span
                  className="mt-2 block h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: theme.colors.accent }}
                />
                <span
                  className="text-xl"
                  style={{
                    color: theme.colors.text,
                    fontFamily: theme.fonts.body
                  }}
                >
                  {text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ImageLeftLayout({
  slide,
  theme
}: {
  slide: SlideContent
  theme: Theme
}) {
  return (
    <div className="flex h-full w-full gap-12 p-16">
      {/* Image */}
      {slide.imageUrl && (
        <div className="relative flex w-1/2 items-center justify-center">
          <Image
            src={slide.imageUrl}
            alt=""
            fill
            sizes="50vw"
            className="rounded-lg object-contain"
            unoptimized
          />
        </div>
      )}

      {/* Text */}
      <div className="flex w-1/2 flex-col justify-center">
        {slide.heading && (
          <h2
            className="text-4xl font-bold leading-tight"
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.heading
            }}
          >
            {slide.heading}
          </h2>
        )}
        {slide.body?.map((item, i) => (
          <p
            key={i}
            className="mt-4 text-xl"
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.body,
              opacity: 0.8
            }}
          >
            {item.content}
          </p>
        ))}
      </div>
    </div>
  )
}

function ChartLayout({ slide, theme }: { slide: SlideContent; theme: Theme }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 p-16 text-center">
      {slide.heading && (
        <h2
          className="text-4xl font-bold"
          style={{ color: theme.colors.text, fontFamily: theme.fonts.heading }}
        >
          {slide.heading}
        </h2>
      )}
      {slide.stats && (
        <div className="grid grid-cols-3 gap-8">
          {slide.stats.map((stat, i) => (
            <div
              key={i}
              className="rounded-xl p-6"
              style={{ backgroundColor: theme.colors.card }}
            >
              <div
                className="text-5xl font-bold"
                style={{ color: theme.colors.accent }}
              >
                {stat.value}
              </div>
              <div
                className="mt-2 text-lg"
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.fonts.body,
                  opacity: 0.7
                }}
              >
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function QuoteLayout({ slide, theme }: { slide: SlideContent; theme: Theme }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-16">
      <div className="relative max-w-3xl text-center">
        <div
          className="absolute -left-8 -top-4 text-8xl opacity-20"
          style={{ color: theme.colors.accent }}
        >
          &ldquo;
        </div>
        {slide.quote && (
          <blockquote
            className="text-4xl font-medium italic leading-relaxed"
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.heading
            }}
          >
            {slide.quote}
          </blockquote>
        )}
        {slide.quoteAttribution && (
          <cite
            className="mt-6 block text-xl not-italic"
            style={{ color: theme.colors.accent, fontFamily: theme.fonts.body }}
          >
            — {slide.quoteAttribution}
          </cite>
        )}
      </div>
    </div>
  )
}

function TextLayout({ slide, theme }: { slide: SlideContent; theme: Theme }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 p-16 text-center">
      {slide.heading && (
        <h2
          className="text-5xl font-bold"
          style={{ color: theme.colors.text, fontFamily: theme.fonts.heading }}
        >
          {slide.heading}
        </h2>
      )}
      {slide.bullets && slide.bullets.length > 0 && (
        <ul className="mt-4 space-y-4">
          {slide.bullets.map((text, i) => (
            <li key={i}>
              <span
                className="text-xl"
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.fonts.body,
                  opacity: 0.85
                }}
              >
                {text}
              </span>
            </li>
          ))}
        </ul>
      )}
      {slide.body?.map((item, i) => (
        <p
          key={i}
          className="text-xl"
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.body,
            opacity: 0.8
          }}
        >
          {item.content}
        </p>
      ))}
    </div>
  )
}

export function SlideRenderer({
  slide,
  theme,
  isActive = true
}: SlideRendererProps) {
  const bgStyle = isGradient(theme.colors.background)
    ? { background: theme.colors.background }
    : { backgroundColor: theme.colors.background }

  const layout = slide.layout ?? 'title'

  return (
    <div
      className={cn(
        'absolute inset-0 h-full w-full transition-opacity duration-300',
        isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}
      style={bgStyle}
    >
      {layout === 'title' && <TitleLayout slide={slide} theme={theme} />}
      {layout === 'section' && <SectionLayout slide={slide} theme={theme} />}
      {layout === 'two_column' && (
        <TwoColumnLayout slide={slide} theme={theme} />
      )}
      {layout === 'image_left' && (
        <ImageLeftLayout slide={slide} theme={theme} />
      )}
      {layout === 'chart' && <ChartLayout slide={slide} theme={theme} />}
      {layout === 'quote' && <QuoteLayout slide={slide} theme={theme} />}
      {layout === 'text' && <TextLayout slide={slide} theme={theme} />}
    </div>
  )
}
