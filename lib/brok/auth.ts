import { db } from '@/lib/db';
import { apiKeys, workspaces } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { hashApiKey } from '@/lib/api-key';
import { NextResponse } from 'next/server';

export interface AuthResult {
  success: true;
  apiKey: typeof apiKeys.$inferSelect;
  workspace: typeof workspaces.$inferSelect;
} | {
  success: false;
  error: 'missing_authorization' | 'invalid_authorization_format' | 'invalid_api_key' | 'inactive_key' | 'workspace_inactive';
  status: number;
};

export async function verifyRequestAuth(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return { success: false, error: 'missing_authorization', status: 401 };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { success: false, error: 'invalid_authorization_format', status: 401 };
  }

  const key = authHeader.slice(7);
  const keyHash = hashApiKey(key);

  const [keyRecord] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!keyRecord) {
    return { success: false, error: 'invalid_api_key', status: 401 };
  }

  if (keyRecord.status !== 'active') {
    return { success: false, error: 'inactive_key', status: 403 };
  }

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, keyRecord.workspaceId))
    .limit(1);

  if (!workspace || workspace.status !== 'active') {
    return { success: false, error: 'workspace_inactive', status: 403 };
  }

  return { success: true, apiKey: keyRecord, workspace };
}

export function unauthorizedResponse(error: AuthResult): NextResponse {
  const body = {
    error: {
      type: 'authentication_error',
      code: error.error,
      message: getErrorMessage(error.error),
    }
  };
  return NextResponse.json(body, { status: error.status });
}

function getErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    missing_authorization: 'Authorization header is required.',
    invalid_authorization_format: 'Authorization header must be Bearer token.',
    invalid_api_key: 'Invalid API key.',
    inactive_key: 'API key is inactive.',
    workspace_inactive: 'Workspace is inactive.',
  };
  return messages[error] || 'Authentication failed.';
}