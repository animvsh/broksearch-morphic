import { describe, expect, it } from 'vitest'

import { parsePresentationMarkdown } from '../deck'
import {
  type ExportSlide,
  slidesToMarkdown,
  slidesToRevealHtml
} from '../export'

const SAMPLE_SLIDES: ExportSlide[] = [
  {
    title: 'Welcome',
    contentJson: {
      id: 'welcome',
      kicker: 'Today',
      body: ['Hello, world.'],
      bullets: []
    },
    speakerNotes: 'Greet the audience warmly.'
  },
  {
    title: 'Roadmap',
    contentJson: {
      body: [],
      bullets: ['Goal one', 'Goal two', 'Goal three']
    },
    speakerNotes: null
  }
]

describe('presentations/export', () => {
  describe('slidesToMarkdown', () => {
    it('returns parseable markdown for the given slides', () => {
      const md = slidesToMarkdown('Demo Deck', SAMPLE_SLIDES)
      const slides = parsePresentationMarkdown(md)
      expect(slides).toHaveLength(2)
      expect(slides[0]?.title).toBe('Welcome')
      expect(slides[1]?.title).toBe('Roadmap')
    })

    it('embeds the deck title and export metadata in a comment', () => {
      const md = slidesToMarkdown('Demo Deck', SAMPLE_SLIDES)
      expect(md).toContain('Brok Presentation: Demo Deck')
      expect(md).toContain('exported')
    })

    it('renders bullets with a leading dash', () => {
      const md = slidesToMarkdown('Deck', SAMPLE_SLIDES)
      expect(md).toContain('- Goal one')
      expect(md).toContain('- Goal two')
    })

    it('renders speaker notes prefixed with notes:', () => {
      const md = slidesToMarkdown('Deck', SAMPLE_SLIDES)
      expect(md).toContain('notes: Greet the audience warmly.')
    })

    it('omits the trailing separator after the last slide', () => {
      const md = slidesToMarkdown('Deck', SAMPLE_SLIDES)
      const trailing = md.split('\n---\n').pop() ?? ''
      expect(trailing).toContain('Roadmap')
    })

    it('renders kickers as kicker: lines', () => {
      const md = slidesToMarkdown('Deck', SAMPLE_SLIDES)
      expect(md).toContain('kicker: Today')
    })
  })

  describe('slidesToRevealHtml', () => {
    it('produces a complete HTML document', () => {
      const html = slidesToRevealHtml('Demo Deck', SAMPLE_SLIDES)
      expect(html).toMatch(/^<!doctype html>/i)
      expect(html).toContain('</html>')
    })

    it('includes a reveal.js stylesheet link', () => {
      const html = slidesToRevealHtml('Demo Deck', SAMPLE_SLIDES)
      expect(html).toContain('unpkg.com/reveal.js')
    })

    it('emits one <section> per slide', () => {
      const html = slidesToRevealHtml('Demo Deck', SAMPLE_SLIDES)
      const sectionCount = (html.match(/<section>/g) ?? []).length
      expect(sectionCount).toBe(2)
    })

    it('embeds bullets as <li> elements', () => {
      const html = slidesToRevealHtml('Demo Deck', SAMPLE_SLIDES)
      expect(html).toContain('<li>Goal one</li>')
      expect(html).toContain('<li>Goal two</li>')
    })

    it('escapes HTML in slide content', () => {
      const slides: ExportSlide[] = [
        {
          title: 'Edge <script>',
          contentJson: { body: [], bullets: [] },
          speakerNotes: null
        }
      ]
      const html = slidesToRevealHtml('Safe', slides)
      expect(html).toContain('Edge &lt;script&gt;')
      expect(html).not.toContain('Edge <script>')
    })
  })
})
