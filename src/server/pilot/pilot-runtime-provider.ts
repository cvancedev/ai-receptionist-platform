import { parseJsonWithoutDuplicateKeys } from "../../ai/providers/provider-output-schema";
import { fictionalBusinessProfile } from "../../fixtures/business-profile";
import { fictionalKnowledgeRecords } from "../../fixtures/knowledge";
import { RECEPTIONIST_SCHEMA_VERSION } from "../persistence/receptionist-persistence";
import { PostgresqlReceptionistPersistence } from "../../persistence/postgresql/postgresql-receptionist-persistence";
import type { ReceptionistBusiness } from "../conversation/receptionist-conversation-service";
import type { ReceptionistPersistence } from "../persistence/receptionist-persistence";
import {
  getReceptionistRuntime,
  type ReceptionistRuntime,
} from "../runtime/receptionist-runtime";
import {
  createPilotReceptionistRuntime,
  type PilotReceptionistRuntime,
  type PilotRuntimeCreationRejection,
} from "./pilot-runtime";

if (typeof window !== "undefined") {
  throw new Error("The pilot runtime provider is server-only.");
}

/**
 * Environment variable holding the complete pilot configuration document.
 * Its presence is the explicit pilot authorization: without it the application
 * serves only the local demonstration.
 */
export const PILOT_CONFIGURATION_ENV = "AI_RECEPTIONIST_PILOT_CONFIGURATION";

/** The only business the pilot can currently compose. */
export const PILOT_BUSINESSES: readonly ReceptionistBusiness[] = Object.freeze([
  Object.freeze({
    profile: fictionalBusinessProfile,
    knowledge: fictionalKnowledgeRecords,
  }),
]);

export type PilotRuntimeCompositionRejection =
  | PilotRuntimeCreationRejection
  | "InvalidConfigurationJson"
  | "DuplicateConfigurationKey"
  | "MissingDatabaseCredential"
  | "SchemaOutdated";

export type PilotRuntimeComposition =
  | { readonly status: "created"; readonly runtime: PilotReceptionistRuntime }
  | { readonly status: "rejected"; readonly reason: PilotRuntimeCompositionRejection };

export interface ComposePilotRuntimeInput {
  readonly configuration: unknown;
  readonly businesses: readonly ReceptionistBusiness[];
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly persistenceFactory?: (connectionString: string) => ReceptionistPersistence;
}

/**
 * Compose the pilot runtime from an already parsed configuration.
 *
 * The configuration names a credential reference, never a credential value.
 * That name must resolve in the server environment; when it does not, the pilot
 * is rejected instead of falling back to another store or to the demo.
 */
export async function composePilotRuntime(
  input: Readonly<ComposePilotRuntimeInput>,
): Promise<PilotRuntimeComposition> {
  const configuration = input.configuration;
  if (!isPlainRecord(configuration)) return rejected("InvalidInput");

  const persistenceSetting = configuration.persistence;
  if (!isPlainRecord(persistenceSetting)
    || typeof persistenceSetting.credentialReference !== "string") {
    // Let the configuration validator produce the precise rejection.
    return finishCreation(
      createPilotReceptionistRuntime({
        configuration,
        businesses: input.businesses,
        persistence: unusablePersistence,
        databaseCredentialReference: "",
      }),
      null,
    );
  }

  const credentialReference = persistenceSetting.credentialReference;
  const connectionString = input.environment[credentialReference];
  if (typeof connectionString !== "string" || connectionString.trim() === "") {
    return rejected("MissingDatabaseCredential");
  }

  const persistence = (input.persistenceFactory
    ?? ((value: string) => new PostgresqlReceptionistPersistence({ connectionString: value })))(
    connectionString,
  );

  return finishCreation(
    createPilotReceptionistRuntime({
      configuration,
      businesses: input.businesses,
      persistence,
      databaseCredentialReference: credentialReference,
    }),
    persistence,
  );
}

async function finishCreation(
  result: ReturnType<typeof createPilotReceptionistRuntime>,
  persistence: ReceptionistPersistence | null,
): Promise<PilotRuntimeComposition> {
  if (result.status === "created") {
    if (!persistence) return rejected("PersistenceUnavailable");
    // The pilot never serves against a database that predates the current
    // receipt and usage schema. A stale or unreadable schema fails closed and
    // is never migrated implicitly during a request.
    const schemaVersion = await persistence.readSchemaVersion();
    if (schemaVersion === null || schemaVersion < RECEPTIONIST_SCHEMA_VERSION) {
      await persistence.close().catch(() => undefined);
      return rejected("SchemaOutdated");
    }
    // Release reservations abandoned by a process that died mid-turn. A
    // failure here must not prevent the runtime from serving; it is retried on
    // the next composition.
    await result.runtime.conversations.reconcileReservations().catch(() => 0);
    return Object.freeze({ status: "created", runtime: result.runtime });
  }
  if (persistence) await persistence.close().catch(() => undefined);
  return rejected(result.reason);
}

function rejected(reason: PilotRuntimeCompositionRejection): PilotRuntimeComposition {
  return Object.freeze({ status: "rejected" as const, reason });
}

/**
 * Placeholder used only so the configuration validator can report the precise
 * rejection for a malformed `persistence` member without opening a database.
 */
const unusablePersistence: ReceptionistPersistence = Object.freeze({
  kind: "in-memory" as const,
  createConversation: async () => "failure" as const,
  loadConversation: async () => ({ status: "failure" } as const),
  findScopeByHandleHash: async () => ({ status: "failure" } as const),
  commitTurn: async () => "failure" as const,
  loadTurnReceipt: async () => ({ status: "failure" } as const),
  monthlyUsageMicros: async () => null,
  reserveUsage: async () => "failure" as const,
  releaseReservation: async () => "failure" as const,
  reconcileStaleReservations: async () => null,
  readSchemaVersion: async () => null,
  createSession: async () => "failure" as const,
  findSession: async () => ({ status: "failure" } as const),
  revokeSession: async () => "failure" as const,
  countSessions: async () => 0,
  pruneSessions: async () => 0,
  close: async () => undefined,
});

export type ReceptionistHttpRuntimeResolution =
  | { readonly status: "pilot"; readonly runtime: PilotReceptionistRuntime }
  | { readonly status: "demo"; readonly runtime: ReceptionistRuntime }
  | { readonly status: "pilot-unavailable" };

type ProviderGlobal = typeof globalThis & {
  __aiReceptionistPilotRuntimeB232B?: PilotReceptionistRuntime;
};

/**
 * Resolve the runtime that HTTP routes must use.
 *
 * - No pilot configuration: the local, clearly labelled demonstration runtime.
 * - Valid pilot configuration: the durable pilot runtime.
 * - Pilot configuration present but unusable: `pilot-unavailable`, never a
 *   silent fallback to the demonstration.
 */
export interface ReceptionistHttpRuntimeOptions {
  /** Composition seam for verification; production uses PostgreSQL. */
  readonly persistenceFactory?: (connectionString: string) => ReceptionistPersistence;
}

export async function resolveReceptionistHttpRuntime(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  options: ReceptionistHttpRuntimeOptions = {},
): Promise<ReceptionistHttpRuntimeResolution> {
  const raw = environment[PILOT_CONFIGURATION_ENV];
  if (raw === undefined || raw.trim() === "") {
    return Object.freeze({ status: "demo" as const, runtime: getReceptionistRuntime() });
  }

  const globalScope = globalThis as ProviderGlobal;
  const cached = globalScope.__aiReceptionistPilotRuntimeB232B;
  if (cached) {
    return Object.freeze({ status: "pilot" as const, runtime: cached });
  }

  const parsed = parseJsonWithoutDuplicateKeys(raw);
  if (parsed.status !== "parsed") {
    return Object.freeze({ status: "pilot-unavailable" as const });
  }

  const composition = await composePilotRuntime({
    configuration: parsed.value,
    businesses: PILOT_BUSINESSES,
    environment,
    persistenceFactory: options.persistenceFactory,
  });
  if (composition.status !== "created") {
    return Object.freeze({ status: "pilot-unavailable" as const });
  }

  globalScope.__aiReceptionistPilotRuntimeB232B = composition.runtime;
  return Object.freeze({ status: "pilot" as const, runtime: composition.runtime });
}

/** Verification-only cache reset. */
export function resetPilotRuntimeCache(): void {
  delete (globalThis as ProviderGlobal).__aiReceptionistPilotRuntimeB232B;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
