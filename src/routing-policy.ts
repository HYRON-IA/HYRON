import type {Provider} from './model-providers.ts';
// Evaluation-only services and routes without a verified free allowance stay manual.
export const MANUAL_ONLY_PROVIDERS:readonly string[]=['cohere','nvidia','huggingface','sambanova'];
export function automaticProviders(providers:readonly Provider[]):Provider[]{
 return providers.filter(p=>!MANUAL_ONLY_PROVIDERS.includes(p.name));
}
