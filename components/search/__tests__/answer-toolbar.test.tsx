import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AnswerToolbar } from '../answer-toolbar'

describe('AnswerToolbar', () => {
  it('keeps actions large enough for mobile touch targets', () => {
    render(<AnswerToolbar answerText="Answer text" />)

    expect(screen.getByRole('button', { name: 'Copy' })).toHaveClass('min-h-11')
    expect(screen.getByRole('button', { name: 'Translate' })).toHaveClass(
      'min-h-11'
    )
  })
})
