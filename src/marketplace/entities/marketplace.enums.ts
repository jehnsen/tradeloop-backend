export enum PostingVisibility {
  NETWORK = 'NETWORK',
  PARTNERS_ONLY = 'PARTNERS_ONLY',
  PRIVATE = 'PRIVATE',
}

export enum PostingStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  MATCHED = 'MATCHED',
  BOOKED = 'BOOKED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export const ACTIVE_POSTING_STATUSES = [PostingStatus.OPEN, PostingStatus.MATCHED];

export enum PricingType {
  FIXED = 'FIXED',
  PER_KG = 'PER_KG',
  NEGOTIABLE = 'NEGOTIABLE',
}

export enum OfferStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  COUNTERED = 'COUNTERED',
  WITHDRAWN = 'WITHDRAWN',
  EXPIRED = 'EXPIRED',
}

export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}
