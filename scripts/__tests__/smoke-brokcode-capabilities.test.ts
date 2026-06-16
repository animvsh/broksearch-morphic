import { describe, expect, it } from 'vitest'

import { getBrokCodeAcceptanceCase } from '@/lib/brokcode/acceptance-matrix'
import { verifyNamedCapabilities } from '@/lib/brokcode/capability-checks'

const baseFiles = [
  {
    path: 'index.html',
    content:
      '<meta name="viewport" content="width=device-width"><form><input required><button>Add</button><button>Edit</button><button>Delete</button></form>'
  },
  {
    path: 'styles.css',
    content: '@media (max-width: 600px) { body { display: block; } }'
  },
  {
    path: 'app.js',
    content:
      'localStorage.setItem("items", "[]"); function submit(){ loading(); error(); }'
  }
]

describe('verifyNamedCapabilities', () => {
  it('requires CRUD create, update, delete, and local storage behavior', () => {
    const testCase = getBrokCodeAcceptanceCase('club-crud')
    expect(testCase).toBeTruthy()

    const checks = verifyNamedCapabilities(baseFiles, testCase!)

    expect(checks).toEqual(
      expect.arrayContaining([
        'capability-create-record',
        'capability-update-record',
        'capability-delete-record',
        'capability-local-storage'
      ])
    )
  })

  it('requires backend-backed mock feedback data file evidence', () => {
    const testCase = getBrokCodeAcceptanceCase('backend-course-feedback')
    expect(testCase).toBeTruthy()

    expect(() => verifyNamedCapabilities(baseFiles, testCase!)).toThrow(
      /mock-feedback-data/
    )
  })
})
