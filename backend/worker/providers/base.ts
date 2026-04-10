import { AIProviderAdapter } from '../../../shared/types/provider';

export interface ProviderRegistry {
  get(provider: string): AIProviderAdapter;
}
