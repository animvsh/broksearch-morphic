import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyRequestAuth } from '../auth';
import { hashApiKey, generateApiKey } from '@/lib/api-key';

// Mock the db
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

// Mock apiKeys and workspaces from schema
vi.mock('@/lib/db/schema', () => ({
  apiKeys: {
    $inferSelect: {},
  },
  workspaces: {
    $inferSelect: {},
  },
}));

describe('verifyRequestAuth', () => {
  const testKey = generateApiKey('live');
  const testHash = hashApiKey(testKey);

  it('returns error for missing authorization header', async () => {
    const mockRequest = {
      headers: {
        get: (name: string) => null,
      },
    } as unknown as Request;

    const result = await verifyRequestAuth(mockRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('missing_authorization');
      expect(result.status).toBe(401);
    }
  });

  it('returns error for invalid bearer format', async () => {
    const mockRequest = {
      headers: {
        get: (name: string) => name === 'authorization' ? 'InvalidFormat' : null,
      },
    } as unknown as Request;

    const result = await verifyRequestAuth(mockRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('invalid_authorization_format');
      expect(result.status).toBe(401);
    }
  });

  it('returns error for unknown API key', async () => {
    const mockRequest = {
      headers: {
        get: (name: string) => name === 'authorization' ? `Bearer ${testKey}` : null,
      },
    } as unknown as Request;

    const result = await verifyRequestAuth(mockRequest);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('invalid_api_key');
      expect(result.status).toBe(401);
    }
  });
});