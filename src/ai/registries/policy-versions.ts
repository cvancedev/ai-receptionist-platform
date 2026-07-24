import type { PolicyVersions } from "../contracts/packages";
import { deepFreeze } from "../shared/immutable";

export const AI_POLICY_VERSIONS: Readonly<PolicyVersions> = deepFreeze({
  applicationAuthorityPolicyVersion: "application-authority-policy/v1",
  promptPolicyVersion: "prompt-policy/v1",
  contextContractVersion: "context-package/v1",
  responseStylePolicyVersion: "response-style-default/v1",
  validatorVersion: "ai-foundation-validator/v1",
  composerVersion: "ai-foundation-composer/v1",
});
