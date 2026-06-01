import { describe, expect, it } from 'vitest'

import {
  buildBrokCodeProjectBrain,
  normalizeBrokCodeProjectBrain
} from '@/lib/brokcode/project-brain'

describe('BrokCode project brain', () => {
  it('infers a student app brain from the prompt and generated files', () => {
    const brain = buildBrokCodeProjectBrain({
      projectName: 'Campus Study Coach',
      command:
        'Build a student study app with lesson summaries, quiz generation, and upload flow for university courses.',
      files: [
        {
          path: 'index.html',
          language: 'html',
          content:
            '<main id="dashboard"><section id="lesson-plan">Upload notes and generate quizzes.</section></main>'
        },
        {
          path: 'src/app/course/page.tsx',
          language: 'tsx',
          content: 'export default function Course(){ return <div>quiz</div> }'
        }
      ]
    })

    expect(brain.product).toContain('Student Study')
    expect(brain.audience).toContain('Students')
    expect(brain.aiFeatures).toEqual(
      expect.arrayContaining(['Quiz generation', 'Summaries', 'File upload'])
    )
    expect(brain.currentPages).toEqual(
      expect.arrayContaining(['Course', 'Dashboard', 'Lesson Plan'])
    )
    expect(brain.suggestedNextActions).toEqual(
      expect.arrayContaining(['Add upload flow', 'Add quiz mode'])
    )
  })

  it('summarizes an online InsForge backend', () => {
    const brain = buildBrokCodeProjectBrain({
      projectName: 'Ops Dashboard',
      files: [],
      backend: {
        provider: 'insforge',
        status: 'ready',
        health: 'online',
        adminKeyConfigured: true,
        capabilities: {
          database: true,
          auth: true,
          storage: false,
          functions: false,
          realtime: true
        }
      }
    })

    expect(brain.backendSummary).toBe(
      'InsForge online; database, auth, realtime.'
    )
    expect(brain.suggestedNextActions).toContain('Test backend data flow')
  })

  it('normalizes persisted brain metadata defensively', () => {
    expect(normalizeBrokCodeProjectBrain({ audience: 'Students' })).toBeNull()
    expect(
      normalizeBrokCodeProjectBrain({
        product: 'Course Companion',
        audience: 'Students',
        currentPages: ['Dashboard', 1, 'Quiz'],
        suggestedNextActions: ['Add auth']
      })
    ).toMatchObject({
      product: 'Course Companion',
      audience: 'Students',
      currentPages: ['Dashboard', 'Quiz'],
      suggestedNextActions: ['Add auth']
    })
  })
})
