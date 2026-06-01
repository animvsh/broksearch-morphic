import type { NextRequest } from 'next/server'

import { proxy } from './proxy'

export { config } from './proxy'

export function middleware(request: NextRequest) {
  return proxy(request)
}
