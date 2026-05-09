import pptxgen from 'pptxgenjs'
import type { Theme } from '../themes'
import type { SlideContent } from '../theme-utils'

/**
 * Export a presentation to PowerPoint (.pptx) format.
 *
 * @param presentation - The presentation data including title, slides, and theme
 * @returns Buffer containing the generated PPTX file
 */
export async function exportToPptx(
  presentation: {
    title: string
    slides: SlideContent[]
    theme: Theme
  }
): Promise<Buffer> {
  const pptx = new pptxgen()

  // Set presentation properties
  pptx.title = presentation.title
  pptx.author = 'Brok'
  pptx.subject = presentation.title

  // Extract theme colors and fonts
  const { colors, fonts } = presentation.theme

  // Helper to convert hex color to valid PPTX color or use fallback
  const toPptxColor = (color: string): string => {
    // If it's a gradient or CSS function, use a solid fallback
    if (color.startsWith('linear-gradient') || color.startsWith('radial-gradient')) {
      return '#FFFFFF'
    }
    // If it's an rgba/hsla, convert to hex approximation
    if (color.startsWith('rgba')) {
      const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (match) {
        const r = parseInt(match[1]).toString(16).padStart(2, '0')
        const g = parseInt(match[2]).toString(16).padStart(2, '0')
        const b = parseInt(match[3]).toString(16).padStart(2, '0')
        return `#${r}${g}${b}`
      }
    }
    // If it's already a hex color, return as-is
    if (color.startsWith('#')) {
      return color
    }
    // Default fallback
    return '#000000'
  }

  // Font fallback: Inter -> Arial for PPTX compatibility
  const toPptxFont = (fontFamily: string): string => {
    if (fontFamily === 'Inter') {
      return 'Arial'
    }
    return fontFamily
  }

  const textColor = toPptxColor(colors.text)
  const accentColor = toPptxColor(colors.accent)
  const bgColor = toPptxColor(colors.background)
  const headingFont = toPptxFont(fonts.heading)
  const bodyFont = toPptxFont(fonts.body)

  // Process each slide
  for (const slide of presentation.slides) {
    const pptxSlide = pptx.addSlide()

    // Set background color
    pptxSlide.background = { color: bgColor }

    // Add speaker notes if present
    const content = slide as SlideContent & { speakerNotes?: string }
    if (content.speakerNotes) {
      pptxSlide.addNotes(content.speakerNotes)
    }

    // Render based on layout type
    switch (slide.layout) {
      case 'title':
        renderTitleSlide(pptxSlide, slide, textColor, headingFont, accentColor)
        break

      case 'section':
        renderSectionSlide(pptxSlide, slide, textColor, headingFont, accentColor)
        break

      case 'two_column':
        renderTwoColumnSlide(pptxSlide, slide, textColor, bodyFont, accentColor)
        break

      case 'image_left':
        renderImageLeftSlide(pptxSlide, slide, textColor, bodyFont, headingFont)
        break

      case 'chart':
        renderChartSlide(pptxSlide, slide, textColor, accentColor, headingFont, bodyFont)
        break

      case 'quote':
        renderQuoteSlide(pptxSlide, slide, textColor, accentColor, bodyFont)
        break

      case 'text':
      default:
        renderTextSlide(pptxSlide, slide, textColor, headingFont, bodyFont)
        break
    }
  }

  // Return as Buffer
  return pptx.writeBuffer()
}

/**
 * Render a title slide: big centered title with optional subtitle
 */
function renderTitleSlide(
  slide: pptxgen.Slide,
  content: SlideContent,
  textColor: string,
  headingFont: string,
  accentColor: string
): void {
  const heading = content.heading || ''
  const subtitle = content.body?.[0]?.content || ''

  // Main title - centered
  slide.addText(heading, {
    fontSize: 44,
    bold: true,
    color: textColor,
    fontFace: headingFont,
    align: 'center',
    y: 2.5,
    w: '100%',
    valign: 'middle'
  })

  // Subtitle below if present
  if (subtitle) {
    slide.addText(subtitle, {
      fontSize: 20,
      color: textColor,
      fontFace: headingFont,
      align: 'center',
      y: 3.8,
      w: '100%'
    })
  }

  // Accent line below title
  slide.addShape(pptxgen.ShapeType.rect, {
    x: 4,
    y: 4.5,
    w: 2,
    h: 0.05,
    fill: { color: accentColor }
  })
}

/**
 * Render a section slide: title with accent bar at top
 */
function renderSectionSlide(
  slide: pptxgen.Slide,
  content: SlideContent,
  textColor: string,
  headingFont: string,
  accentColor: string
): void {
  const heading = content.heading || ''

  // Accent rectangle at top
  slide.addShape(pptxgen.ShapeType.rect, {
    x: 0,
    y: 0,
    w: 10,
    h: 0.15,
    fill: { color: accentColor }
  })

  // Section title
  slide.addText(heading, {
    fontSize: 36,
    bold: true,
    color: textColor,
    fontFace: headingFont,
    align: 'left',
    x: 0.5,
    y: 1.5,
    w: 9
  })

  // Subtitle/body if present
  const bodyText = content.body?.map(b => b.content).join('\n') || ''
  if (bodyText) {
    slide.addText(bodyText, {
      fontSize: 18,
      color: textColor,
      fontFace: headingFont,
      align: 'left',
      x: 0.5,
      y: 2.3,
      w: 9,
      lineSpacingMultiple: 1.3
    })
  }
}

/**
 * Render a two-column slide: text on left and right
 */
function renderTwoColumnSlide(
  slide: pptxgen.Slide,
  content: SlideContent,
  textColor: string,
  bodyFont: string,
  accentColor: string
): void {
  const bullets = content.bullets || []
  const heading = content.heading || ''

  // Heading at top
  if (heading) {
    slide.addText(heading, {
      fontSize: 28,
      bold: true,
      color: textColor,
      fontFace: bodyFont,
      align: 'left',
      x: 0.5,
      y: 0.5,
      w: 9
    })
  }

  // Split bullets into two columns
  const midpoint = Math.ceil(bullets.length / 2)
  const leftBullets = bullets.slice(0, midpoint)
  const rightBullets = bullets.slice(midpoint)

  // Left column
  if (leftBullets.length > 0) {
    slide.addText(
      leftBullets.map((text, i) => ({
        text,
        bullet: true,
        fontSize: 16,
        color: textColor,
        fontFace: bodyFont
      })),
      {
        x: 0.5,
        y: heading ? 1.3 : 0.5,
        w: 4.3,
        valign: 'top'
      }
    )
  }

  // Right column
  if (rightBullets.length > 0) {
    slide.addText(
      rightBullets.map((text, i) => ({
        text,
        bullet: true,
        fontSize: 16,
        color: textColor,
        fontFace: bodyFont
      })),
      {
        x: 5.2,
        y: heading ? 1.3 : 0.5,
        w: 4.3,
        valign: 'top'
      }
    )
  }
}

/**
 * Render an image-left slide: image on left, text on right
 */
function renderImageLeftSlide(
  slide: pptxgen.Slide,
  content: SlideContent,
  textColor: string,
  bodyFont: string,
  headingFont: string
): void {
  const imageUrl = content.imageUrl
  const heading = content.heading || ''
  const bullets = content.bullets || []

  // Image on left side (placeholder if no URL)
  if (imageUrl) {
    slide.addImage({
      url: imageUrl,
      x: 0.5,
      y: 1,
      w: 4,
      h: 5
    })
  } else {
    // Placeholder rectangle
    slide.addShape(pptxgen.ShapeType.rect, {
      x: 0.5,
      y: 1,
      w: 4,
      h: 5,
      fill: { color: 'E5E7EB' },
      line: { color: 'D1D5DB', width: 1 }
    })
    slide.addText('[Image]', {
      color: '9CA3AF',
      fontFace: bodyFont,
      align: 'center',
      x: 0.5,
      y: 3,
      w: 4
    })
  }

  // Text content on right side
  let yOffset = 1.0

  if (heading) {
    slide.addText(heading, {
      fontSize: 28,
      bold: true,
      color: textColor,
      fontFace: headingFont,
      align: 'left',
      x: 5,
      y: yOffset,
      w: 4.5
    })
    yOffset += 0.8
  }

  if (bullets.length > 0) {
    slide.addText(
      bullets.map(text => ({
        text,
        bullet: true,
        fontSize: 14,
        color: textColor,
        fontFace: bodyFont
      })),
      {
        x: 5,
        y: yOffset,
        w: 4.5,
        valign: 'top'
      }
    )
  }
}

/**
 * Render a chart slide: placeholder chart visualization
 */
function renderChartSlide(
  slide: pptxgen.Slide,
  content: SlideContent,
  textColor: string,
  accentColor: string,
  headingFont: string,
  bodyFont: string
): void {
  const heading = content.heading || ''
  const stats = content.stats || []

  // Heading
  if (heading) {
    slide.addText(heading, {
      fontSize: 28,
      bold: true,
      color: textColor,
      fontFace: headingFont,
      align: 'left',
      x: 0.5,
      y: 0.5,
      w: 9
    })
  }

  // Render stat cards
  const cardWidth = 2.5
  const cardHeight = 1.8
  const startX = (10 - (stats.length * cardWidth + (stats.length - 1) * 0.5)) / 2
  const y = 2

  stats.forEach((stat, i) => {
    const x = startX + i * (cardWidth + 0.5)

    // Card background
    slide.addShape(pptxgen.ShapeType.rect, {
      x,
      y,
      w: cardWidth,
      h: cardHeight,
      fill: { color: 'F3F4F6' },
      line: { color: 'E5E7EB', width: 0.5 }
    })

    // Stat value
    slide.addText(stat.value, {
      fontSize: 32,
      bold: true,
      color: accentColor,
      fontFace: bodyFont,
      align: 'center',
      x,
      y: y + 0.3,
      w: cardWidth
    })

    // Stat label
    slide.addText(stat.label, {
      fontSize: 12,
      color: textColor,
      fontFace: bodyFont,
      align: 'center',
      x,
      y: y + 1.2,
      w: cardWidth
    })
  })
}

/**
 * Render a quote slide: large italic text with attribution
 */
function renderQuoteSlide(
  slide: pptxgen.Slide,
  content: SlideContent,
  textColor: string,
  accentColor: string,
  bodyFont: string
): void {
  const quote = content.quote || ''
  const attribution = content.quoteAttribution || ''

  // Accent bar on left
  slide.addShape(pptxgen.ShapeType.rect, {
    x: 0.5,
    y: 1.5,
    w: 0.08,
    h: 2.5,
    fill: { color: accentColor }
  })

  // Quote text
  slide.addText(quote, {
    fontSize: 24,
    italic: true,
    color: textColor,
    fontFace: bodyFont,
    align: 'left',
    x: 0.8,
    y: 1.5,
    w: 8.5,
    lineSpacingMultiple: 1.4
  })

  // Attribution if present
  if (attribution) {
    slide.addText(`— ${attribution}`, {
      fontSize: 16,
      color: textColor,
      fontFace: bodyFont,
      align: 'left',
      x: 0.8,
      y: 4.2,
      w: 8.5
    })
  }
}

/**
 * Render a text slide: bullet list with optional heading
 */
function renderTextSlide(
  slide: pptxgen.Slide,
  content: SlideContent,
  textColor: string,
  headingFont: string,
  bodyFont: string
): void {
  const heading = content.heading || ''
  const bullets = content.bullets || []

  // Heading if present
  if (heading) {
    slide.addText(heading, {
      fontSize: 32,
      bold: true,
      color: textColor,
      fontFace: headingFont,
      align: 'left',
      x: 0.5,
      y: 0.5,
      w: 9
    })
  }

  // Bullet list
  if (bullets.length > 0) {
    slide.addText(
      bullets.map(text => ({
        text,
        bullet: true,
        fontSize: 18,
        color: textColor,
        fontFace: bodyFont
      })),
      {
        x: 0.5,
        y: heading ? 1.3 : 0.5,
        w: 9,
        valign: 'top',
        lineSpacingMultiple: 1.5
      }
    )
  }
}
