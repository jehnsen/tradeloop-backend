export const QueueNames = {
  MATCHING: 'matching',
  NOTIFICATIONS: 'notifications',
  MAINTENANCE: 'maintenance',
} as const;

export const JobNames = {
  MATCH_LOAD_POSTING: 'match-load-posting',
  MATCH_VEHICLE_POSTING: 'match-vehicle-posting',
  SEND_NOTIFICATION: 'send-notification',
  EXPIRE_MARKETPLACE_POSTINGS: 'expire-marketplace-postings',
  EXPIRE_OFFERS: 'expire-offers',
  CLEANUP_REFRESH_TOKENS: 'cleanup-refresh-tokens',
  CLEANUP_TRACKING_HISTORY: 'cleanup-tracking-history',
} as const;
