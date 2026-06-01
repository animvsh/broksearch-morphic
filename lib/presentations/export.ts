type ContentJson = {
  id?: string
  kicker?: string | null
  body?: string[]
  bullets?: string[]
}

export type ExportSlide = {
  title: string
  contentJson: ContentJson
  speakerNotes: string | null
}

function toTitle(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeMarkdownHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function slidesToMarkdown(title: string, slides: ExportSlide[]): string {
  const lines: string[] = []
  lines.push(
    `<!-- Brok Presentation: ${escapeMarkdownHtml(title).replace(/--/g, '&#45;&#45;')} (exported ${new Date().toISOString()}) -->`
  )
  lines.push('')

  slides.forEach((slide, index) => {
    const content = slide.contentJson ?? {}
    const kicker = content.kicker
    const body = Array.isArray(content.body) ? content.body : []
    const bullets = Array.isArray(content.bullets) ? content.bullets : []
    const notes = slide.speakerNotes?.trim()

    lines.push(
      `# ${escapeMarkdownHtml(slide.title || toTitle(`Slide ${index + 1}`))}`
    )
    if (kicker) lines.push(`kicker: ${escapeMarkdownHtml(kicker)}`)
    for (const paragraph of body) lines.push(escapeMarkdownHtml(paragraph))
    for (const bullet of bullets) lines.push(`- ${escapeMarkdownHtml(bullet)}`)
    if (notes) lines.push(`notes: ${escapeMarkdownHtml(notes)}`)

    if (index < slides.length - 1) {
      lines.push('')
      lines.push('---')
      lines.push('')
    }
  })

  return lines.join('\n')
}

export function slidesToRevealHtml(
  title: string,
  slides: ExportSlide[]
): string {
  const slideHtml = slides
    .map(slide => {
      const content = slide.contentJson ?? {}
      const kicker = content.kicker
      const body = Array.isArray(content.body) ? content.body : []
      const bullets = Array.isArray(content.bullets) ? content.bullets : []
      const notes = slide.speakerNotes

      return `      <section>
        <h2>${escapeHtml(slide.title)}</h2>
        ${kicker ? `<p class="kicker">${escapeHtml(kicker)}</p>` : ''}
        ${body.map(p => `<p>${escapeHtml(p)}</p>`).join('\n        ')}
        ${
          bullets.length > 0
            ? `<ul>${bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
            : ''
        }
        ${notes ? `<aside class="notes">${escapeHtml(notes)}</aside>` : ''}
      </section>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="https://unpkg.com/reveal.js@6.0.1/dist/reveal.css" />
  </head>
  <body>
    <div class="reveal">
      <div class="slides">
${slideHtml}
      </div>
    </div>
    <script src="https://unpkg.com/reveal.js@6.0.1/dist/reveal.js"></script>
    <script>Reveal.initialize();</script>
  </body>
</html>
`
}
