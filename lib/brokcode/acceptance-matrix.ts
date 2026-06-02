export type BrokCodeAcceptanceCase = {
  id: string
  title: string
  category:
    | 'landing'
    | 'dashboard'
    | 'crud'
    | 'form_workflow'
    | 'mobile_utility'
    | 'backend_backed'
  prompt: string
  requiredFiles: string[]
  requiredCapabilities: string[]
  minimumInteractions: number
  expectedTerms: string[]
  minimumGeneratedFiles: number
}

export const BROKCODE_ACCEPTANCE_MATRIX: BrokCodeAcceptanceCase[] = [
  {
    id: 'landing-bakery',
    title: 'Landing page',
    category: 'landing',
    prompt: [
      'Create a polished single-page bakery landing page.',
      'Return named files for index.html, styles.css, and app.js.',
      'Include a hero, menu cards, social proof, and a working newsletter form.'
    ].join(' '),
    requiredFiles: ['index.html', 'styles.css', 'app.js'],
    requiredCapabilities: ['responsive-layout', 'newsletter-form'],
    minimumInteractions: 2,
    expectedTerms: ['bakery', 'menu', 'newsletter'],
    minimumGeneratedFiles: 3
  },
  {
    id: 'student-dashboard',
    title: 'Student dashboard',
    category: 'dashboard',
    prompt: [
      'Create a student success dashboard for a university advising office.',
      'Return named files for index.html, styles.css, and app.js.',
      'Include course progress cards, upcoming deadlines, advisor notes, and a useful interactive filter.'
    ].join(' '),
    requiredFiles: ['index.html', 'styles.css', 'app.js'],
    requiredCapabilities: ['filter-control', 'dashboard-cards'],
    minimumInteractions: 2,
    expectedTerms: ['student', 'dashboard', 'deadline', 'advisor'],
    minimumGeneratedFiles: 3
  },
  {
    id: 'club-crud',
    title: 'CRUD data app',
    category: 'crud',
    prompt: [
      'Create a campus club inventory CRUD app.',
      'Return named files for index.html, styles.css, and app.js.',
      'Include a table or list, add/edit/delete controls, empty state, and localStorage-backed sample data.'
    ].join(' '),
    requiredFiles: ['index.html', 'styles.css', 'app.js'],
    requiredCapabilities: ['create-record', 'update-record', 'delete-record'],
    minimumInteractions: 3,
    expectedTerms: ['club', 'inventory', 'add', 'delete'],
    minimumGeneratedFiles: 3
  },
  {
    id: 'lab-intake-form',
    title: 'Form workflow',
    category: 'form_workflow',
    prompt: [
      'Create a multi-step lab equipment request form for students.',
      'Return named files for index.html, styles.css, and app.js.',
      'Include validation, review state, submit confirmation, and clear accessible labels.'
    ].join(' '),
    requiredFiles: ['index.html', 'styles.css', 'app.js'],
    requiredCapabilities: ['validation', 'review-state', 'confirmation-state'],
    minimumInteractions: 3,
    expectedTerms: ['lab', 'equipment', 'request', 'review'],
    minimumGeneratedFiles: 3
  },
  {
    id: 'mobile-study-planner',
    title: 'Mobile utility',
    category: 'mobile_utility',
    prompt: [
      'Create a mobile-first study planner utility.',
      'Return named files for index.html, styles.css, and app.js.',
      'Include task chips, timer or checklist behavior, compact navigation, and a layout optimized for phones.'
    ].join(' '),
    requiredFiles: ['index.html', 'styles.css', 'app.js'],
    requiredCapabilities: ['mobile-layout', 'timer-or-checklist'],
    minimumInteractions: 2,
    expectedTerms: ['study', 'planner', 'task', 'timer'],
    minimumGeneratedFiles: 3
  },
  {
    id: 'backend-course-feedback',
    title: 'Backend-backed app',
    category: 'backend_backed',
    prompt: [
      'Create a backend-backed course feedback app prototype.',
      'Return named files for index.html, styles.css, app.js, and api/mock-feedback.json.',
      'Include a feedback feed, submit form, loading/error states, and JavaScript that reads or simulates persisted feedback data.'
    ].join(' '),
    requiredFiles: ['index.html', 'styles.css', 'app.js'],
    requiredCapabilities: [
      'feedback-feed',
      'submit-flow',
      'loading-state',
      'error-state',
      'persisted-data-simulation'
    ],
    minimumInteractions: 3,
    expectedTerms: ['course', 'feedback', 'submit', 'loading'],
    minimumGeneratedFiles: 4
  }
]

export function getBrokCodeAcceptanceCase(id: string | undefined) {
  if (!id) return BROKCODE_ACCEPTANCE_MATRIX[0] ?? null
  return BROKCODE_ACCEPTANCE_MATRIX.find(testCase => testCase.id === id) ?? null
}

export function getBrokCodeAcceptanceCases(ids: string[] | undefined) {
  if (!ids || ids.length === 0) return BROKCODE_ACCEPTANCE_MATRIX

  return ids.map(id => {
    const testCase = getBrokCodeAcceptanceCase(id)
    if (!testCase) {
      throw new Error(`Unknown BrokCode acceptance case "${id}"`)
    }
    return testCase
  })
}

export function matchesBrokCodeAcceptanceTerms(
  text: string,
  testCase: BrokCodeAcceptanceCase
) {
  const normalized = text.toLowerCase()
  return testCase.expectedTerms.every(term =>
    normalized.includes(term.toLowerCase())
  )
}

export function buildBrokCodeAcceptancePrompt(
  testCase: BrokCodeAcceptanceCase
) {
  return [
    testCase.prompt,
    [
      'Acceptance requirements for this generated app:',
      `- Visible page copy must include these words or clear labels: ${testCase.expectedTerms.join(', ')}.`,
      `- Save these files: ${testCase.requiredFiles.join(', ')}.`,
      `- Include these capabilities: ${testCase.requiredCapabilities.join(', ')}.`,
      `- Include at least ${testCase.minimumInteractions} visible interactive controls.`
    ].join('\n')
  ].join('\n\n')
}
