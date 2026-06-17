import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderCitations } from '../citation-marker'
import type { SourceCardData } from '../source-card'

describe('renderCitations', () => {
  it('keeps inline citation markers compact and mapped to the cited source', () => {
    const onJumpToSource = vi.fn()

    render(
      <p>
        {renderCitations(
          'First claim [1], second claim [2].',
          sources,
          onJumpToSource
        )}
      </p>
    )

    const first = screen.getByRole('button', {
      name: /citation 1: first source/i
    })
    const second = screen.getByRole('button', {
      name: /citation 2: second source/i
    })

    expect(first).toHaveClass('h-3.5')
    expect(first).toHaveAttribute('title', 'Citation 1: First source')
    expect(second).toHaveAttribute('title', 'Citation 2: Second source')

    fireEvent.click(second)

    expect(onJumpToSource).toHaveBeenCalledWith(2)
  })
})

const sources: SourceCardData[] = [
  {
    id: '1',
    url: 'https://first.example/report',
    title: 'First source',
    domain: 'first.example',
    snippet: 'First source snippet.'
  },
  {
    id: '2',
    url: 'https://second.example/report',
    title: 'Second source',
    domain: 'second.example',
    snippet: 'Second source snippet.'
  }
]
