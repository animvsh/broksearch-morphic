import { describe, expect, it } from 'vitest'

import {
  normalizeGithubRepository,
  normalizeGithubRepositoryList,
  parseGithubNextLink
} from '../github-repositories'

describe('BrokCode GitHub repository picker helpers', () => {
  it('normalizes direct GitHub API repositories', () => {
    expect(
      normalizeGithubRepository({
        full_name: 'animvsh/student-app',
        default_branch: 'main',
        private: true,
        html_url: 'https://github.com/animvsh/student-app',
        pushed_at: '2026-05-25T01:00:00Z'
      })
    ).toEqual({
      fullName: 'animvsh/student-app',
      defaultBranch: 'main',
      private: true,
      htmlUrl: 'https://github.com/animvsh/student-app',
      pushedAt: '2026-05-25T01:00:00Z'
    })
  })

  it('normalizes nested Composio-style repository payloads', () => {
    expect(
      normalizeGithubRepositoryList({
        data: {
          repositories: [
            {
              name: 'coursework',
              owner: { login: 'ucsc' },
              defaultBranch: 'trunk',
              htmlUrl: 'https://github.com/ucsc/coursework',
              pushedAt: '2026-05-25T02:00:00Z'
            },
            {
              fullName: 'ucsc/coursework',
              defaultBranch: 'main',
              pushedAt: '2026-05-25T03:00:00Z'
            }
          ]
        }
      })
    ).toEqual([
      {
        fullName: 'ucsc/coursework',
        defaultBranch: 'trunk',
        private: false,
        htmlUrl: 'https://github.com/ucsc/coursework',
        pushedAt: '2026-05-25T02:00:00Z'
      }
    ])
  })

  it('rejects unsafe repository names and parses pagination links', () => {
    expect(normalizeGithubRepository({ full_name: '../oops' })).toBeNull()
    expect(
      parseGithubNextLink(
        '<https://api.github.com/user/repos?page=2>; rel="next", <https://api.github.com/user/repos?page=5>; rel="last"'
      )
    ).toBe('https://api.github.com/user/repos?page=2')
  })
})
