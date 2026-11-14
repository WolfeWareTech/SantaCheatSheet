/** Logical v1 interfaces. Backend phases select additive storage/resolvers. */
export type IsoTime = string;
export type SeasonId = number;
export type ParticipantId = string;
export type Subject = string;
export interface Season {
  year: SeasonId;
  state: "open" | "closed";
  deadline: IsoTime | null;
  revision: number;
}
export interface SeasonControl { activeYear: SeasonId; revision: number }
/** Admin-only directory; never expose contacts in public season data. */
export interface Participant {
  id: ParticipantId;
  subject: Subject | null;
  displayName: string;
  registeredEmail: string | null;
  phone: string | null;
  preferredChannel: "email" | "phone" | "none";
  archived: boolean;
  emailOptOut: boolean;
  phoneOptOut: boolean;
  revision: number;
}
export interface Participation {
  participantId: ParticipantId;
  year: SeasonId;
  state: "active" | "excluded";
}
export type ResponseState = "not_started" | "draft" | "submitted" | "legacy_saved";
/** Admin-visible progress; no answer content or private contact fields. */
export interface ResponseProgress {
  participantId: ParticipantId;
  year: SeasonId;
  state: ResponseState;
  savedAt: IsoTime | null;
  submittedAt: IsoTime | null;
  revisedAt: IsoTime | null;
  revision: number;
}
/** Previous-year answers: admin only. Current year: owner, or admin if submitted. */
export interface AnswerFields {
  favoriteCandySnack: string[];
  favoriteScents: string[];
  favoriteFastFoodPlaces: string[];
  favoriteRestaurants: string[];
  favoriteStores: string[];
  cellPhoneModel: string;
  favoriteSaying: string;
  favoriteSportsTeam: string;
  favoriteColorsTheme: string;
  favoriteLogoEmblem: string;
  anniversaryDate: string;
  favoritePlaces: string[];
  clothingSizes: string;
  otherFavorites: string;
  familyDetails: string;
  wishlistTopItems: string[];
  additionalNotes: string;
}
export interface Response extends ResponseProgress {
  sheetId: string;
  ownerSubject: Subject;
  displayName: string;
  answers: AnswerFields;
}
/** Immutable lookup key; create-if-absent must be atomic on the server. */
export interface ResponseKey { participantId: ParticipantId; year: SeasonId }
export interface SaveCommand extends ResponseKey {
  answers: AnswerFields;
  expectedRevision: number;
  intent: "save_draft" | "submit";
  idempotencyKey: string;
}
export type DeliveryState = "not_sent" | "queued" | "provider_accepted" | "delivered" | "bounced" | "failed";
export interface Invitation {
  id: string;
  participantId: ParticipantId;
  year: SeasonId;
  purpose: "initial" | "reminder";
  channel: "email" | "phone";
  batchId: string;
  idempotencyKey: string;
  expiresAt: IsoTime;
  revokedAt: IsoTime | null;
  credentialVerifier: string;
  delivery: DeliveryState;
}
export type ManualShareState = "opened" | "cancelled" | "copied" | "reported_sent";
export type ErrorCode = "network" | "session_expired" | "forbidden" | "validation" | "missing_data" | "conflict" | "rate_limited" | "provider" | "unknown";
export interface AppError {
  code: ErrorCode;
  safeMessage: string;
  retryable: boolean;
  correlationId?: string;
}
export type Result<T> = { ok: true; data: T } | { ok: false; error: AppError };
/** Raw upstream result adapter MUST reject nonempty errors even with data. */
export interface UpstreamResult<T> { data?: T | null; errors?: readonly unknown[] }
export interface Page<T> { items: readonly T[]; nextToken: string | null }
