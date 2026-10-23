/**
 * Experience modes for the local prototype surface.
 *
 * The certified fixture mode remains the default. The simulated AI
 * demonstration is opt-in and still local, offline, credential-free, and
 * unavailable for customer release or external action.
 */
export const PROTOTYPE_EXPERIENCE_MODES = [
  "fixture",
  "ai-simulated",
  "durable-activated",
] as const;

export type PrototypeExperienceMode = (typeof PROTOTYPE_EXPERIENCE_MODES)[number];

/** Initial value of the simulated AI mode; the certified fixture default is untouched. */
export const AI_SIMULATED_MODE_ENABLED_BY_DEFAULT = false;
