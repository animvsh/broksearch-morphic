import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BrokBuildEmptyState } from '../empty-state'

describe('BrokBuildEmptyState', () => {
  it('submits prompts to the autostart builder workspace', () => {
    render(<BrokBuildEmptyState chips={[]} />)

    const input = screen.getByPlaceholderText('Build me an AI app that...')
    const form = input.closest('form')

    expect(form).toHaveAttribute('action', '/build/new')
    expect(form).toHaveAttribute('method', 'get')
    expect(input).toHaveAttribute('name', 'prompt')
    expect(screen.getByDisplayValue('1')).toHaveAttribute('name', 'autostart')

    fireEvent.change(input, {
      target: { value: 'Build a clinic support CRM' }
    })
    fireEvent.submit(form!)

    expect(
      screen.getByRole('button', { name: /starting/i })
    ).toBeDisabled()
  })
})
