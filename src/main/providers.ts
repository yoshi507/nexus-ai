import { randomUUID } from 'crypto';

export type Provider = {
  id: string;
  name: string;
  url: string;
};

export const defaultProviders: Provider[] = [
  { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com' },
  { id: 'grok', name: 'Grok', url: 'https://grok.com' },
  { id: 'gemini', name: 'Google Gemini', url: 'https://gemini.google.com' },
  { id: 'claude', name: 'Claude', url: 'https://claude.ai' },
  { id: 'perplexity', name: 'Perplexity', url: 'https://www.perplexity.ai' },
  { id: 'copilot', name: 'Microsoft Copilot', url: 'https://copilot.microsoft.com' }
];

export function isValidUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function normalizeProvider(value: unknown, id?: string): Provider {
  if (!value || typeof value !== 'object') throw new Error('Provider details are required.');
  const candidate = value as { id?: unknown; name?: unknown; url?: unknown };
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  if (!name || name.length > 50) throw new Error('Provider name must be between 1 and 50 characters.');
  if (!isValidUrl(candidate.url)) throw new Error('Provider URL must be a valid HTTPS address.');
  return {
    id: id ?? (typeof candidate.id === 'string' ? candidate.id : randomUUID()),
    name,
    url: new URL(candidate.url).toString()
  };
}
