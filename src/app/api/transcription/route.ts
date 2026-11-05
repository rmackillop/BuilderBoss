import { NextRequest } from 'next/server';
import { authorized, ApiError, fail, ok } from '@/lib/financial-api';
import { aiKey, limitAI, openAI } from '@/lib/ai-provider';

export const runtime = 'nodejs';
export const maxDuration = 60;
const MAX_BYTES = 3 * 1024 * 1024;
export async function POST(req: NextRequest) {
  try {
    const { user } = await authorized(req);
    limitAI(user.id); aiKey();
    if (!req.headers.get('content-type')?.startsWith('multipart/form-data')) throw new ApiError(415, 'INVALID_AUDIO', 'An audio recording is required.');
    if (Number(req.headers.get('content-length') || 0) > MAX_BYTES) throw new ApiError(413, 'TOO_LARGE', 'Recording too large. Please record a shorter instruction.');
    const reader = req.body?.getReader();
    if (!reader) throw new ApiError(400, 'INVALID_AUDIO', 'No recording received.');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); throw new ApiError(413, 'TOO_LARGE', 'Recording too large. Please record a shorter instruction.'); }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    let form;
    try { form = await new Response(bytes, { headers: { 'content-type': req.headers.get('content-type')! } }).formData(); }
    catch { throw new ApiError(400, 'INVALID_AUDIO', 'Could not read the recording. Please try again.'); }
    const audio = form.get('audio');
    if (!(audio instanceof File) || !audio.size || !['audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/x-m4a','audio/ogg'].includes(audio.type.split(';')[0])) throw new ApiError(400, 'INVALID_AUDIO', 'Unsupported or empty recording. Please use text input.');
    const upstream = new FormData();
    upstream.set('file', audio, audio.type.includes('mp4') || audio.type.includes('m4a') ? 'instruction.m4a' : audio.type.includes('ogg') ? 'instruction.ogg' : audio.type.includes('wav') ? 'instruction.wav' : audio.type.includes('mpeg') ? 'instruction.mp3' : 'instruction.webm');
    upstream.set('model', process.env.AI_GATEWAY_TRANSCRIPTION_MODEL || 'openai/gpt-transcribe');
    const result = await openAI('audio/transcriptions', upstream);
    if (typeof result.text !== 'string' || !result.text.trim()) throw new ApiError(422, 'NO_SPEECH', 'No speech detected. Please try again or type your instruction.');
    return ok({ text: result.text.trim().slice(0, 2000) });
  } catch (error) { return fail(error); }
}
