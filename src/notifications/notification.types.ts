import { Role } from '../common/enums';

export const NotificationTypes = {
  MATCH_FOUND: 'MARKETPLACE_MATCH_FOUND',
  OFFER_RECEIVED: 'OFFER_RECEIVED',
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  OFFER_REJECTED: 'OFFER_REJECTED',
  TRIP_ASSIGNED: 'TRIP_ASSIGNED',
  TRIP_DISPATCHED: 'TRIP_DISPATCHED',
  TRIP_STARTED: 'TRIP_STARTED',
  TRIP_COMPLETED: 'TRIP_COMPLETED',
  DELIVERY_COMPLETED: 'DELIVERY_COMPLETED',
} as const;

export interface NotifyRequest {
  organizationId: string;
  /** Restrict recipients to these roles; omit for every active member. */
  roles?: readonly Role[];
  /** Restrict recipients to these users (must be active members). */
  userIds?: string[];
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  /** Makes delivery idempotent per recipient. */
  dedupeKey?: string;
}
