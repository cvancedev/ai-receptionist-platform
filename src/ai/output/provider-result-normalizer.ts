import type { NormalizedProviderResult, ProviderAdapterResult } from "../contracts/results";
import { deepFreeze } from "../shared/immutable";

export class ProviderResultNormalizer {
  normalize(result: ProviderAdapterResult): NormalizedProviderResult {
    return deepFreeze({
      ...result,
      usage: { ...result.usage },
      error: result.error ? { ...result.error } : null,
      normalizedAt: "prototype-deterministic",
    });
  }
}
