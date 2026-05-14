import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { UserTextSection } from '../user-text-section'

describe('UserTextSection uploaded files', () => {
  it('shows a clean file pill instead of raw uploaded-file context', () => {
    const content = [
      'what is this',
      '<uploaded_file name="lab3.pdf">The private extracted lab text</uploaded_file>'
    ].join('\n')

    const { container } = render(<UserTextSection content={content} />)

    expect(screen.getByText('what is this')).toBeInTheDocument()
    expect(screen.getByText('lab3.pdf')).toBeInTheDocument()
    expect(container.textContent).not.toContain('<uploaded_file')
    expect(container.textContent).not.toContain('private extracted lab text')
  })
})
