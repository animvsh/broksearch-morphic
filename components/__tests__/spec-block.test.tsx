import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { ChatProvider } from '@/lib/contexts/chat-context'
import { parseSpecBlock } from '@/lib/render/parse-spec-block'

import { SpecBlock } from '../spec-block'

describe('SpecBlock', () => {
  test('submits follow-up query actions back into chat', async () => {
    const sendMessage = vi.fn()
    const source = [
      '{"op":"add","path":"/root","value":"main"}',
      '{"op":"add","path":"/elements/main","value":{"type":"Stack","props":{"direction":"vertical","gap":"sm"},"children":["header","q1"]}}',
      '{"op":"add","path":"/elements/header","value":{"type":"Heading","props":{"title":"Related","icon":"related"},"children":[]}}',
      '{"op":"add","path":"/elements/q1","value":{"type":"Button","props":{"text":"How does Brok pick sources?","variant":"link","icon":"arrow-right"},"on":{"press":{"action":"submitQuery","params":{"query":"How does Brok pick sources?"}}},"children":[]}}'
    ].join('\n')

    render(
      <ChatProvider sendMessage={sendMessage}>
        <SpecBlock
          result={{
            status: 'ready',
            source,
            spec: parseSpecBlock(source)
          }}
        />
      </ChatProvider>
    )

    expect(screen.getByText('Related')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /how does brok/i }))
    })

    expect(sendMessage).toHaveBeenCalledWith({
      role: 'user',
      parts: [{ type: 'text', text: 'How does Brok pick sources?' }]
    })
  })
})
