import { phonePilotBusinessProfile, phonePilotKnowledge } from "../../fixtures/phone-pilot-business";
import { parseJsonWithoutDuplicateKeys } from "../../ai/providers/provider-output-schema";
import { PostgresqlReceptionistPersistence } from "../../persistence/postgresql/postgresql-receptionist-persistence";
import { PostgresqlTelephoneCallStore } from "../../persistence/postgresql/postgresql-call-store";
import { DurableReceptionistConversationService } from "../conversation/durable-receptionist-conversation-service";
import type { ReceptionistBusiness } from "../conversation/receptionist-conversation-service";
import { RECEPTIONIST_SCHEMA_VERSION } from "../persistence/receptionist-persistence";
import {
  TELEPHONY_CONFIGURATION_ENV,
  resolveTelephonyConfiguration,
  type ValidatedTelephonyConfiguration,
} from "../../telephony/telephony-configuration";
import { TelephoneReceptionFlow } from "../../telephony/call-flow";
import { TelephoneReceptionService } from "./telephone-reception-service";
import type { TelephoneCallStore } from "./call-store";

if (typeof window !== "undefined") {
  throw new Error("The telephone runtime is server-only.");
}

/**
 * The businesses the telephone pilot answers for.
 *
 * One profile for the first pilot, as agreed: the onboarding for a new customer
 * is this fixture, not a dashboard.
 */
export const TELEPHONE_BUSINESSES: readonly ReceptionistBusiness[] = Object.freeze([
  Object.freeze({
    profile: phonePilotBusinessProfile,
    knowledge: phonePilotKnowledge,
  }),
]);

/** Server-side variable holding the PostgreSQL connection string for calls. */
export const TELEPHONY_DATABASE_VARIABLE = "AI_RECEPTIONIST_TELEPHONY_DATABASE_URL" as const;

/** Monthly model-spend cap enforced by the existing reservation flow. */
export const DEFAULT_TELEPHONE_BUDGET_MICROS = 10 * 1_000_000;

export interface TelephoneRuntime {
  readonly configuration: ValidatedTelephonyConfiguration;
  readonly business: ReceptionistBusiness;
  readonly service: TelephoneReceptionService;
  readonly store: TelephoneCallStore;
}

export type TelephoneRuntimeRejection =
  | "NotConfigured"
  | "InvalidConfigurationJson"
  | "ConfigurationRejected"
  | "BusinessNotAvailable"
  | "MissingDatabaseCredential"
  | "DatabaseUnavailable"
  | "SchemaOutdated";

export type TelephoneRuntimeResolution =
  | { readonly status: "ready"; readonly runtime: TelephoneRuntime }
  | { readonly status: "unavailable"; readonly reason: TelephoneRuntimeRejection };

type TelephoneGlobal = typeof globalThis & {
  __aiReceptionistTelephoneRuntimeV1?: TelephoneRuntime;
};

/**
 * Compose the telephone runtime, or refuse to exist.
 *
 * A rejected composition means the voice endpoint answers with a spoken apology
 * rather than running a dialogue it cannot persist or authorize. Nothing here
 * opens a connection until the configuration has been validated.
 */
export async function resolveTelephoneRuntime(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<TelephoneRuntimeResolution> {
  const cached = (globalThis as TelephoneGlobal).__aiReceptionistTelephoneRuntimeV1;
  if (cached) return Object.freeze({ status: "ready" as const, runtime: cached });

  const raw = environment[TELEPHONY_CONFIGURATION_ENV];
  if (raw === undefined || raw.trim() === "") return unavailable("NotConfigured");

  const parsed = parseJsonWithoutDuplicateKeys(raw);
  if (parsed.status !== "parsed") return unavailable("InvalidConfigurationJson");

  const configurationResult = resolveTelephonyConfiguration(parsed.value, environment);
  if (configurationResult.status === "rejected") {
    return unavailable("ConfigurationRejected");
  }
  const configuration = configurationResult.value;

  const route = configuration.businesses[0];
  const business = TELEPHONE_BUSINESSES.find(
    (entry) => entry.profile.id === route?.businessId,
  );
  if (!business) return unavailable("BusinessNotAvailable");

  const connectionString = environment[TELEPHONY_DATABASE_VARIABLE];
  if (typeof connectionString !== "string" || connectionString.trim() === "") {
    return unavailable("MissingDatabaseCredential");
  }

  // Both schemas must already be current. A pilot never migrates implicitly
  // during a customer's call.
  const readinessCheck = new PostgresqlReceptionistPersistence({ connectionString });
  let schemaVersion: number | null = null;
  try {
    schemaVersion = await readinessCheck.readSchemaVersion();
  } finally {
    await readinessCheck.close().catch(() => undefined);
  }
  if (schemaVersion === null || schemaVersion < RECEPTIONIST_SCHEMA_VERSION) {
    return unavailable("SchemaOutdated");
  }
  if (!(await PostgresqlTelephoneCallStore.schemaReady(connectionString))) {
    return unavailable("SchemaOutdated");
  }

  const persistence = new PostgresqlReceptionistPersistence({ connectionString });
  const store: TelephoneCallStore = new PostgresqlTelephoneCallStore({ connectionString });
  const conversations = new DurableReceptionistConversationService([business], {
    persistence,
    // The monthly cap the existing reservation flow enforces for this business.
    monthlyBudgetMicrosByBusiness: { [business.profile.id]: DEFAULT_TELEPHONE_BUDGET_MICROS },
  });
  const flow = new TelephoneReceptionFlow({ conversations, business });
  const service = new TelephoneReceptionService({
    flow,
    store,
    business,
    speechHints: [
      ...business.profile.services.map((svc) => svc.name),
      ...business.profile.serviceArea,
    ],
  });

  const runtime: TelephoneRuntime = Object.freeze({
    configuration,
    business,
    service,
    store,
  });
  (globalThis as TelephoneGlobal).__aiReceptionistTelephoneRuntimeV1 = runtime;
  return Object.freeze({ status: "ready" as const, runtime });
}

/** Verification-only cache reset. */
export function resetTelephoneRuntimeCache(): void {
  delete (globalThis as TelephoneGlobal).__aiReceptionistTelephoneRuntimeV1;
}

function unavailable(reason: TelephoneRuntimeRejection): TelephoneRuntimeResolution {
  return Object.freeze({ status: "unavailable" as const, reason });
}
