import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FollowUpChips } from '../follow-up-chips'

describe('FollowUpChips', () => {
  it('wraps follow-up questions instead of forcing mobile horizontal overflow', () => {
    const onSelect = vi.fn()

    render(
      <FollowUpChips
        followUps={[
          {
            label: 'Compare Brok to Perplexity',
            query: 'Compare Brok Search to Perplexity'
          },
          {
            label: 'Show the product architecture',
            query: 'Show Brok Search product architecture'
          }
        ]}
        onSelect={onSelect}
      />
    )

    const root = screen.getByTestId('follow-up-chips')
    expect(root.className).toContain('flex-wrap')
    expect(root.className).not.toContain('overflow-x-auto')

    fireEvent.click(
      screen.getByRole('button', { name: /Compare Brok to Perplexity/i })
    )

    expect(onSelect).toHaveBeenCalledWith('Compare Brok Search to Perplexity')
  })
})
