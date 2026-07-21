import type { BusinessProfile } from "../domain/business-profile";
import { createPlaceholderValidationResult } from "./types";

export function validateBusinessProfile(businessProfile: BusinessProfile) {
  // TODO: Replace this placeholder with the approved profile validation rules.
  void businessProfile;
  return createPlaceholderValidationResult();
}
