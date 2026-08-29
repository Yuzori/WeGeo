/** Plafonds réellement appliqués côté serveur. Le catalogue marketing doit rester aligné. */
export interface PlanLimits {
  maxDomains: number;
  maxPerDomain: number;
  maxGridSize: number;
  lookupDirigeant: boolean;
  maxSeats: number;
  mapAndCalls: boolean;
  extendedOptions: boolean;
  exportSheets: boolean;
}

export const PLAN_LIMITS: Record<'starter' | 'pro' | 'agence', PlanLimits> = {
  starter: {
    maxDomains: 2,
    maxPerDomain: 50,
    maxGridSize: 0,
    lookupDirigeant: false,
    maxSeats: 1,
    mapAndCalls: false,
    extendedOptions: false,
    exportSheets: false,
  },
  pro: {
    maxDomains: 8,
    maxPerDomain: 250,
    maxGridSize: 2,
    lookupDirigeant: true,
    maxSeats: 3,
    mapAndCalls: true,
    extendedOptions: true,
    exportSheets: true,
  },
  agence: {
    maxDomains: 15,
    maxPerDomain: 1000,
    maxGridSize: 5,
    lookupDirigeant: true,
    maxSeats: 10,
    mapAndCalls: true,
    extendedOptions: true,
    exportSheets: true,
  },
};

export const DEV_PLAN_LIMITS: PlanLimits = PLAN_LIMITS.agence;
