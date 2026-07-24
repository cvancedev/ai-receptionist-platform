# Sprint 4 Security Audit

## Scope

This audit evaluates fail-closed handling in the Sprint 4 deterministic mock pipeline. “Fail closed” means the input is rejected, classified as non-valid, or converted to a non-authoritative decision without state mutation, customer release, networking, persistence, or action execution.

## Failure-Case Results

| Threat or failure case | Expected fail-closed behavior | Implementation and test evidence | Result | Residual risk |
| --- | --- | --- | --- | --- |
| Malformed JSON | Parsing fails before proposal validation | Bounded parser returns `RawOutputMalformed`; malformed and trailing-text assertions pass | PASS | Provider transport limits are not implemented |
| Empty provider response | Parsing fails or terminal provider status is classified | Empty string and non-completed provider results are rejected/classified | PASS | Real provider response envelopes are not certified |
| Oversized response | Parser rejects content above the configured character limit | Focused reduced-limit assertion returns `RawOutputMalformed` | PASS | Limit is character-based and applied after receipt |
| Excessive nesting | Parser rejects content above maximum depth | Focused depth-limit assertion passes | PASS | No streaming parser exists |
| Dangerous object keys | Parser rejects prototype-related keys recursively | `__proto__` assertion passes | PASS | This is not a general content-safety filter |
| Unsupported task ID or version | Registry/gateway stops before adapter execution | `UnknownTask` and `UnsupportedTaskVersion` assertions pass | PASS | Registry governance remains application process policy |
| Unsupported proposal type | Structural validation rejects the proposal | `UnknownProposalType` scenario is not accepted | PASS | Future contracts require equivalent allowlisting |
| Invalid schema or field type | Structural validation returns invalid | Missing required field and wrong-type assertions pass | PASS | Semantic coverage is prototype-specific |
| Missing required fields | Proposal cannot be valid | `RequiredFieldMissing` assertion passes | PASS | No repair executor exists |
| Unexpected fields | Entire proposal is invalid under reject-extra policy | Action-like and generic unexpected fields are rejected | PASS | Field names alone do not detect every harmful natural-language request |
| Duplicate proposals | Reprocessing is rejected before an accepted decision | Duplicate ID produces `DuplicateProposalProcessing` | PASS | Guard is in-memory and process-local |
| Invalid source or knowledge references | Semantic validation rejects unapproved references | Message and knowledge-reference scenarios fail | PASS | Production retrieval and permission systems do not exist |
| Provider refusal | Output is not parsed or accepted | Refusal becomes `ProviderResultRefused` and a rejected decision | PASS | Real-provider refusal taxonomies may differ |
| Provider incomplete/failure | Result is not accepted; only a classification is returned | Both become retry-eligible read-only decisions | PASS | No retry executor, backoff, or production budget enforcement exists |
| Provider cancellation | Processing remains cancelled | Cancellation assertion passes | PASS | Real cancellation propagation is not implemented |
| Parser failure | No proposal reaches validator or application decision as valid | Parser failures produce an invalid validation result | PASS | Raw-output audit hashing is not implemented |
| Validation failure | Decision is non-authoritative and authorization flags remain false | Layered failure scenarios and decision assertions pass | PASS | Production policy breadth is not certified |
| Prompt-injection-like customer text | Text remains untrusted context data and cannot become policy or authority | Injection-like fixture is preserved only in the Context Package; Prompt Package contains approved references, not the text | PASS WITH LIMITATION | This proves structural containment only, not comprehensive prompt-injection prevention or model robustness |
| Model output requests mutation or external action | Structural/authority validation rejects it and no executor exists | State mutation, escalation activation, completion, release, `toolCall`, and `externalAction` attempts fail | PASS | Natural-language social engineering requires future model and content testing |
| Cross-business or cross-conversation output | Scope validation rejects it | Business and conversation mismatch scenarios fail | PASS | Only fictional single-process fixtures are exercised |
| Stale profile or state revision | Revision validation rejects it | Profile and state mismatch scenarios fail | PASS | Concurrency and durable revision storage are not implemented |

## Prompt-Injection Qualification

Sprint 4 separates application-owned task, policy, permission, prohibition, and output-contract references from customer-controlled context. The prototype Prompt Package does not contain production prompt prose and does not copy the injection-like customer text into instruction fields. This is structural containment, not proof that a future model will resist prompt injection. A real provider, real prompt, tool environment, retrieval system, and adversarial evaluation are all outside this certification.

## Conclusion

The current prototype fails closed for the reviewed structural, scope, semantic, provider, duplicate, and authority cases. No reviewed failure path gains state, release, networking, persistence, or action authority. Residual risks are bounded by the mock-only, in-memory scope and must be reassessed before any real provider or side-effect capability is introduced.
