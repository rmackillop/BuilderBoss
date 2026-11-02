import { ApiError } from './financial-api';

export function aiKey() {
  // The initial deployment stored the Gateway key under OPENAI_API_KEY.
  // Vercel cannot rename sensitive variables; retain that server-only alias.
  const key = process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new ApiError(503, 'AI_NOT_CONFIGURED', 'Voice and conversation are awaiting server configuration. Please contact your administrator.');
  return key;
}

// Best-effort per-instance cost guard. Authentication is always checked first.
const windows = new Map<string, { count: number; until: number }>();
export function limitAI(userId: string) {
  const now = Date.now();
  for (const [key, value] of windows) if (value.until < now) windows.delete(key);
  const entry = windows.get(userId) ?? { count: 0, until: now + 60000 };
  if (++entry.count > 20) throw new ApiError(429, 'RATE_LIMITED', 'Please wait a minute before trying again.');
  windows.set(userId, entry);
}

export async function openAI(path: 'responses' | 'audio/transcriptions', payload: Record<string, unknown> | FormData) {
  const headers: Record<string, string> = { Authorization: `Bearer ${aiKey()}` };
  headers['Content-Type'] = 'application/json';
  let endpoint = 'https://ai-gateway.vercel.sh/v1/responses';
  let requestBody: Record<string, unknown>;
  if (path === 'audio/transcriptions') {
    if (!(payload instanceof FormData)) throw new ApiError(500, 'INVALID_AUDIO_REQUEST', 'Recording could not be prepared.');
    const file = payload.get('file');
    if (!(file instanceof File)) throw new ApiError(400, 'INVALID_AUDIO', 'Recording is required.');
    endpoint = 'https://ai-gateway.vercel.sh/v4/ai/transcription-model';
    headers['ai-gateway-protocol-version'] = '0.0.1';
    headers['ai-transcription-model-specification-version'] = '4';
    headers['ai-model-id'] = String(payload.get('model'));
    requestBody = { audio: Buffer.from(await file.arrayBuffer()).toString('base64'), mediaType: file.type.split(';')[0] };
  } else {
    if (payload instanceof FormData) throw new ApiError(500, 'INVALID_AI_REQUEST', 'Instruction could not be prepared.');
    requestBody = payload;
  }
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST', headers,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(45000), cache: 'no-store'
    });
  } catch { throw new ApiError(504, 'AI_TIMEOUT', 'The AI service did not respond. Please try again.'); }
  if (!response.ok) {
    let code = '';
    try {
      const error = await response.json();
      if (typeof error.error?.code === 'string' && /^[a-z_]{1,60}$/.test(error.error.code)) code = error.error.code;
    } catch { /* Provider may return a non-JSON error. */ }
    // No credentials, prompts, recordings, or financial data enter application logs.
    console.error('AI provider request rejected', { endpoint: path, status: response.status, code });
    if (response.status === 401) throw new ApiError(502, 'AI_CREDENTIALS_REJECTED', 'The AI provider rejected the configured key. An administrator needs to check the server AI credentials.');
    if (response.status === 402) throw new ApiError(503, 'AI_QUOTA_EXHAUSTED', 'AI Gateway credits or a spending budget are exhausted. Please contact your administrator.');
    if (code === 'customer_verification_required') throw new ApiError(503, 'AI_ACCOUNT_VERIFICATION', 'Vercel AI Gateway requires account verification before this request can run. Please check AI Gateway in Vercel.');
    if (code === 'insufficient_quota') throw new ApiError(503, 'AI_QUOTA_EXHAUSTED', 'The AI account has no available API credits or has reached its spending limit. Please contact your administrator.');
    if (response.status === 429) throw new ApiError(429, 'AI_RATE_LIMITED', 'The AI provider is busy or rate limited. Please wait a minute and try again.');
    if (response.status === 403 || response.status === 404) throw new ApiError(503, 'AI_MODEL_UNAVAILABLE', 'The configured AI model is unavailable to this account. Please contact your administrator.');
    throw new ApiError(502, 'AI_UNAVAILABLE', 'The AI service is unavailable. Please try again or contact your administrator.');
  }
  return response.json();
}
