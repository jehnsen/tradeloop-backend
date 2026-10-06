// GENERATED from trade-route-frontend/data/cargo.ts by scripts/sync-domain.mjs. Do not edit here:
// change the frontend file and run `npm run domain:sync`.
import type { AreaId, CargoCategory, Leg } from "../types";

/** Common cargo handled by the vans. Independent of the trading product catalog. */
export interface CargoType {
  key: string;
  label: string;
  category: CargoCategory;
  /** Typical handling unit and its gross weight incl. ice / packaging. */
  unit: string;
  kgPerUnit: number;
  handling?: string;
  /** Indicative purchase value per kg — only used for company-owned backhaul cargo. */
  valuePerKg?: number;
}

export const CARGO_TYPES: CargoType[] = [
  { key: "sugpo", label: "Sugpo (tiger prawn), iced", category: "Seafood", unit: "styro box", kgPerUnit: 25, handling: "Keep iced; stack max 5 boxes high; load last, unload first." },
  { key: "hipon", label: "Hipon (shrimp), iced", category: "Seafood", unit: "styro box", kgPerUnit: 25, handling: "Keep iced; do not stack under banyeras." },
  { key: "tahong", label: "Tahong (mussels)", category: "Shellfish", unit: "sack", kgPerUnit: 30, handling: "Keep shaded and moist; do not ice directly." },
  { key: "talaba", label: "Talaba (oysters)", category: "Shellfish", unit: "sack", kgPerUnit: 30, handling: "Keep shaded; handle sacks gently." },
  { key: "alimango", label: "Alimango (mud crab), live", category: "Seafood", unit: "crate", kgPerUnit: 18, handling: "Live cargo — ventilated crates, never ice directly." },
  { key: "bangus", label: "Bangus (milkfish), iced", category: "Seafood", unit: "banyera", kgPerUnit: 45, handling: "Iced banyeras; drain meltwater before unloading." },
  { key: "tilapia", label: "Tilapia, iced", category: "Seafood", unit: "banyera", kgPerUnit: 45 },
  { key: "pusit", label: "Pusit (squid), iced", category: "Seafood", unit: "styro box", kgPerUnit: 25 },
  { key: "tulingan", label: "Tulingan (frigate tuna), iced", category: "Seafood", unit: "banyera", kgPerUnit: 45 },
  { key: "niyog", label: "Niyog (mature coconut)", category: "Produce", unit: "sack", kgPerUnit: 35 },
  { key: "saba", label: "Saging saba", category: "Produce", unit: "bundle", kgPerUnit: 25 },
  { key: "kamote", label: "Kamote (sweet potato)", category: "Produce", unit: "sack", kgPerUnit: 40 },
  { key: "red-onion", label: "Red onion", category: "Produce", unit: "sack", kgPerUnit: 25, valuePerKg: 86 },
  { key: "white-onion", label: "White onion", category: "Produce", unit: "sack", kgPerUnit: 25, valuePerKg: 80 },
  { key: "garlic", label: "Garlic", category: "Produce", unit: "sack", kgPerUnit: 20, valuePerKg: 92 },
  { key: "ginger", label: "Ginger (luya)", category: "Produce", unit: "sack", kgPerUnit: 25, valuePerKg: 88 },
  { key: "potato", label: "Potato", category: "Produce", unit: "sack", kgPerUnit: 25, valuePerKg: 58 },
  { key: "carrots", label: "Carrots", category: "Produce", unit: "crate", kgPerUnit: 22, valuePerKg: 54 },
  { key: "cabbage", label: "Cabbage", category: "Produce", unit: "crate", kgPerUnit: 22, valuePerKg: 36 },
  { key: "feeds", label: "Aquaculture feeds", category: "Dry Goods", unit: "sack", kgPerUnit: 25 },
  { key: "rice", label: "Rice (sacks)", category: "Dry Goods", unit: "sack", kgPerUnit: 50 },
  { key: "frozen", label: "Frozen goods (boxed)", category: "General Cargo", unit: "box", kgPerUnit: 20, handling: "Keep van doors closed; unload within 30 minutes." },
  { key: "general", label: "General cargo", category: "General Cargo", unit: "package", kgPerUnit: 20 },
  { key: "returnables", label: "Empty banyeras & styro boxes (returnables)", category: "General Cargo", unit: "bundle", kgPerUnit: 12 },
];

const cargoMap = new Map(CARGO_TYPES.map((c) => [c.key, c]));
export const cargoByKey = (key: string) => cargoMap.get(key)!;
export const CARGO_CATEGORIES: CargoCategory[] = ["Seafood", "Shellfish", "Produce", "Dry Goods", "General Cargo"];

/**
 * Demo freight rate card (₱/kg, gross weight) for shared-van cargo from Lucena.
 * Illustrative only — the operator negotiates per customer.
 */
export const RATE_CARD: Partial<Record<AreaId, number>> = {
  navotas: 11.2,
  valenzuela: 11.5,
  caloocan: 11.2,
  "quezon-city": 11.8,
  manila: 11,
  pasay: 10.5,
  paranaque: 10.5,
  "las-pinas": 10.5,
  bacoor: 10,
  imus: 10,
  dasmarinas: 9.5,
  "general-trias": 10,
  calamba: 8,
  "santa-rosa": 8.5,
  "batangas-city": 9,
};
/** Return-leg (backhaul) cargo toward Quezon is priced lower to fill empty space. */
export const BACKHAUL_RATE_PER_KG = 5;
export const MINIMUM_FREIGHT = 1800;
export const BACKHAUL_MINIMUM_FREIGHT = 1500;

/** Suggested freight for a shipment, rounded to ₱50. */
export function suggestFreight(leg: Leg, areaId: AreaId, weightKg: number) {
  if (leg === "return") return Math.max(BACKHAUL_MINIMUM_FREIGHT, Math.round((weightKg * BACKHAUL_RATE_PER_KG) / 50) * 50);
  const rate = RATE_CARD[areaId] ?? 11;
  const bulk = weightKg >= 2000 ? 0.95 : 1;
  return Math.max(MINIMUM_FREIGHT, Math.round((weightKg * rate * bulk) / 50) * 50);
}
