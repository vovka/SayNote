import { GroqAdapter } from './groq';
import { OpenRouterAdapter } from './openrouter';

const registry = {
  groq: new GroqAdapter(),
  openrouter: new OpenRouterAdapter()
};

export function getProvider(provider: string) {
  const adapter = registry[provider as keyof typeof registry];
  if (!adapter) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  return adapter;
}
