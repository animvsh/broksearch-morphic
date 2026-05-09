import { NextRequest, NextResponse } from 'next/server';

import { unauthorizedResponse,verifyRequestAuth } from '@/lib/brok/auth';
import { BROK_MODELS,isValidBrokModel } from '@/lib/brok/models';
import { calculateCost,routeToProvider } from '@/lib/brok/provider-router';
import { checkRateLimit, recordRateLimitEvent } from '@/lib/brok/rate-limiter';
import { generateRequestId,recordUsage } from '@/lib/brok/usage-tracker';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = generateRequestId();

  // Auth
  const auth = await verifyRequestAuth(request);
  if (!auth.success) {
    return unauthorizedResponse(auth);
  }

  // Parse body
  const body = await request.json();
  const { model: modelId, messages, stream = false, temperature, max_tokens } = body;

  // Validate model
  if (!modelId || !isValidBrokModel(modelId)) {
    return NextResponse.json({
      error: {
        type: 'invalid_request_error',
        code: 'invalid_model',
        message: `Invalid model. Available: ${Object.keys(BROK_MODELS).join(', ')}`,
      }
    }, { status: 400 });
  }

  // Check model is allowed for this key
  const allowedModels = auth.apiKey.allowedModels as string[];
  if (allowedModels.length > 0 && !allowedModels.includes(modelId)) {
    return NextResponse.json({
      error: {
        type: 'invalid_request_error',
        code: 'model_not_allowed',
        message: `This API key does not have access to ${modelId}.`,
      }
    }, { status: 403 });
  }

  // Check rate limit
  const rpmLimit = auth.apiKey.rpmLimit ?? 60;
  const rateLimit = await checkRateLimit(
    auth.apiKey.id,
    auth.workspace.id,
    rpmLimit
  );

  if (!rateLimit.allowed) {
    await recordRateLimitEvent(
      auth.apiKey.id,
      auth.workspace.id,
      'rpm',
      rateLimit.limit,
      rateLimit.current,
      true
    );

    return NextResponse.json({
      error: {
        type: 'rate_limit_error',
        code: 'rate_limit_exceeded',
        message: 'Rate limit exceeded for this API key.',
        limit: `${rateLimit.limit} requests per minute`,
        retry_after_seconds: Math.ceil((rateLimit.resetAt * 1000 - Date.now()) / 1000),
      }
    }, {
      status: 429,
      headers: {
        'X-Brok-RateLimit-Limit': String(rateLimit.limit),
        'X-Brok-RateLimit-Remaining': String(Math.max(0, rateLimit.current)),
        'X-Brok-RateLimit-Reset': String(rateLimit.resetAt),
        'Retry-After': String(Math.ceil((rateLimit.resetAt * 1000 - Date.now()) / 1000)),
      }
    });
  }

  // Record rate limit check
  await recordRateLimitEvent(
    auth.apiKey.id,
    auth.workspace.id,
    'rpm',
    rateLimit.limit,
    rateLimit.current,
    false
  );

  try {
    // Route to provider
    const providerResponse = await routeToProvider(modelId, {
      model: modelId,
      messages,
      stream,
      temperature,
      maxTokens: max_tokens,
    });

    const latencyMs = Date.now() - startTime;

    // Calculate costs
    const inputTokens = providerResponse.usage?.prompt_tokens || 0;
    const outputTokens = providerResponse.usage?.completion_tokens || 0;
    const providerCost = calculateCost(modelId, inputTokens, outputTokens);
    const markup = 1.5; // 50% markup
    const billedAmount = providerCost * markup;

    // Record usage
    await recordUsage({
      requestId,
      workspaceId: auth.workspace.id,
      userId: auth.apiKey.userId,
      apiKeyId: auth.apiKey.id,
      endpoint: 'chat',
      model: modelId,
      provider: BROK_MODELS[modelId].provider,
      inputTokens,
      outputTokens,
      providerCostUsd: providerCost,
      billedUsd: billedAmount,
      latencyMs,
      status: 'success',
    });

    // Transform response to Brok format
    const brokResponse = {
      id: requestId,
      object: 'chat.completion',
      model: modelId,
      choices: providerResponse.choices,
      usage: providerResponse.usage,
    };

    return NextResponse.json(brokResponse, {
      headers: {
        'X-Brok-Request-Id': requestId,
        'X-Brok-RateLimit-Limit': String(rateLimit.limit),
        'X-Brok-RateLimit-Remaining': String(Math.max(0, rateLimit.limit - rateLimit.current - 1)),
        'X-Brok-RateLimit-Reset': String(rateLimit.resetAt),
      }
    });

  } catch (error) {
    const latencyMs = Date.now() - startTime;

    await recordUsage({
      requestId,
      workspaceId: auth.workspace.id,
      userId: auth.apiKey.userId,
      apiKeyId: auth.apiKey.id,
      endpoint: 'chat',
      model: modelId,
      provider: BROK_MODELS[modelId].provider,
      inputTokens: 0,
      outputTokens: 0,
      providerCostUsd: 0,
      billedUsd: 0,
      latencyMs,
      status: 'error',
      errorCode: error instanceof Error ? error.message : 'unknown_error',
    });

    return NextResponse.json({
      error: {
        type: 'internal_error',
        code: 'provider_error',
        message: error instanceof Error ? error.message : 'An error occurred',
      }
    }, { status: 500 });
  }
}
