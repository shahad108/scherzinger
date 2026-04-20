import { IS_DEMO } from './brand';

const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_KEY;
const MODEL = 'anthropic/claude-sonnet-4-6';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const X_TITLE = IS_DEMO ? 'PRYZM Demo Analytics' : 'Scherzinger Analytics Platform';

export async function streamChat(messages, { onChunk, onDone, onError, signal }) {
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': window.location.origin,
        'X-Title': X_TITLE,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        stream: true,
        max_tokens: 4096,
        temperature: 0.3,
      }),
      signal,
    });

    if (!res.ok) {
      const err = await res.text();
      onError?.(new Error(`API error ${res.status}: ${err}`));
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') { onDone?.(); return; }
        try {
          const parsed = JSON.parse(payload);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk?.(content);
        } catch {}
      }
    }
    onDone?.();
  } catch (err) {
    if (err.name !== 'AbortError') {
      onError?.(err);
    }
  }
}

/**
 * Non-streaming quick chat — for lightweight tasks like generating follow-up suggestions.
 * Uses Haiku for speed and low cost.
 */
export async function quickChat(messages, { maxTokens = 300, signal } = {}) {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': X_TITLE,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      max_tokens: maxTokens,
      temperature: 0.5,
    }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}
