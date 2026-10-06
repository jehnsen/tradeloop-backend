// GENERATED from trade-route-frontend/data/products.ts by scripts/sync-domain.mjs. Do not edit here:
// change the frontend file and run `npm run domain:sync`.
import type { Product } from "../types";

type P = Omit<Product, "slug" | "status" | "unitWeightKg" | "moq" | "bulkThreshold"> &
  Partial<Pick<Product, "status" | "unitWeightKg" | "moq" | "bulkThreshold">>;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const ICED = "Iced in styrofoam boxes (≈20 kg net per box)";
const SACK = "Mesh sacks (≈25 kg per sack)";

const RAW: P[] = [
  // ── Seafood ─────────────────────────────────────────────────────────────
  {
    id: "P-SUG-J", sku: "SF-SUG-J", name: "Sugpo / Tiger Prawn", localName: "Sugpo", variant: "Jumbo (16–20 pcs/kg)",
    category: "seafood", subcategory: "Shrimp & Prawns", unit: "kg", loadFactor: 1.8,
    cost: 410, wholesalePrice: 500, sellingPrice: 520, origin: "Pagbilao & Sariaya, Quezon", flow: "outbound",
    grade: "Class A — live-harvested, uniform size", icon: "shrimp", moq: 10,
    description: "Pond-raised black tiger prawns harvested before dawn and packed in ice within the hour. Jumbo sizing preferred by restaurants and hotels for grilling and sinigang.",
    packaging: [ICED, "Vacuum-sealed 1 kg packs (hotel spec)"], storage: "Keep at 0–4 °C on flake ice. Re-ice every 6 hours.", shelfLifeDays: 2,
  },
  {
    id: "P-SUG-L", sku: "SF-SUG-L", name: "Sugpo / Tiger Prawn", localName: "Sugpo", variant: "Large (21–25 pcs/kg)",
    category: "seafood", subcategory: "Shrimp & Prawns", unit: "kg", loadFactor: 1.8,
    cost: 368, wholesalePrice: 450, sellingPrice: 480, origin: "Pagbilao & Tayabas, Quezon", flow: "outbound",
    grade: "Class A", icon: "shrimp", moq: 20,
    description: "Our highest-volume seafood line. Large tiger prawns from partner ponds in Pagbilao and Tayabas, sorted and iced at the Lucena bodega before the 3:30 AM dispatch.",
    packaging: [ICED, "Banyera with crushed ice (dealer spec)"], storage: "Keep at 0–4 °C on flake ice.", shelfLifeDays: 2,
  },
  {
    id: "P-SUG-M", sku: "SF-SUG-M", name: "Sugpo / Tiger Prawn", localName: "Sugpo", variant: "Medium (26–35 pcs/kg)",
    category: "seafood", subcategory: "Shrimp & Prawns", unit: "kg", loadFactor: 1.8,
    cost: 322, wholesalePrice: 400, sellingPrice: 430, origin: "Tayabas, Quezon", flow: "outbound",
    grade: "Class B — mixed medium", icon: "shrimp", moq: 20,
    description: "Medium tiger prawns suited for palengke retail and catering. Good value per kilo for halabos and gambas.",
    packaging: [ICED], storage: "Keep at 0–4 °C on flake ice.", shelfLifeDays: 2,
  },
  {
    id: "P-HIP-S", sku: "SF-HIP-S", name: "Hipon Suahe", localName: "Hipon", variant: "Suahe (small, live-fresh)",
    category: "seafood", subcategory: "Shrimp & Prawns", unit: "kg", loadFactor: 1.8,
    cost: 238, wholesalePrice: 300, sellingPrice: 330, origin: "Tayabas Bay, Quezon", flow: "outbound",
    grade: "Class A", icon: "shrimp", moq: 20,
    description: "Small suahe shrimp from Tayabas Bay fishponds. A staple for palengke vendors and carinderias.",
    packaging: [ICED], storage: "Keep at 0–4 °C.", shelfLifeDays: 2,
  },
  {
    id: "P-HIP-W", sku: "SF-HIP-W", name: "Hipon Puti", localName: "Hipon", variant: "White shrimp",
    category: "seafood", subcategory: "Shrimp & Prawns", unit: "kg", loadFactor: 1.8,
    cost: 262, wholesalePrice: 330, sellingPrice: 360, origin: "Pagbilao, Quezon", flow: "outbound",
    grade: "Class A", icon: "shrimp", moq: 20,
    description: "White shrimp, cleaner shells and sweeter meat. Popular with seafood restaurants and dampa paluto stalls.",
    packaging: [ICED], storage: "Keep at 0–4 °C.", shelfLifeDays: 2,
  },
  {
    id: "P-TAH", sku: "SF-TAH", name: "Tahong / Green Mussel", localName: "Tahong", variant: "In shell, bulk",
    category: "seafood", subcategory: "Shellfish", unit: "kg", loadFactor: 1.1,
    cost: 76, wholesalePrice: 110, sellingPrice: 128, origin: "Tayabas Bay (Pagbilao), Quezon", flow: "outbound",
    grade: "Class A — 7 cm+ shell", icon: "shell", moq: 50,
    description: "Rope-grown green mussels from Pagbilao farms. Harvested the afternoon before dispatch and kept wet overnight.",
    packaging: [SACK], storage: "Keep cool and moist. Do not submerge in fresh water.", shelfLifeDays: 2,
  },
  {
    id: "P-TAH-C", sku: "SF-TAH-C", name: "Tahong / Green Mussel", localName: "Tahong", variant: "Cleaned & debearded",
    category: "seafood", subcategory: "Shellfish", unit: "kg", loadFactor: 1.15,
    cost: 94, wholesalePrice: 135, sellingPrice: 150, origin: "Tayabas Bay (Pagbilao), Quezon", flow: "outbound",
    grade: "Restaurant grade", icon: "shell", moq: 20,
    description: "Mussels cleaned, debearded and sorted for restaurants and caterers — ready for the kitchen.",
    packaging: ["10 kg mesh bags in crates"], storage: "Keep at 2–6 °C.", shelfLifeDays: 2,
  },
  {
    id: "P-TAL", sku: "SF-TAL", name: "Talaba / Oyster", localName: "Talaba", variant: "In shell",
    category: "seafood", subcategory: "Shellfish", unit: "kg", loadFactor: 1.1,
    cost: 98, wholesalePrice: 140, sellingPrice: 160, origin: "Pagbilao, Quezon", flow: "outbound",
    grade: "Class A", icon: "shell", moq: 30,
    description: "Rack-cultured oysters from Pagbilao. Uniform medium shells ideal for baked talaba and ihaw-ihaw.",
    packaging: [SACK], storage: "Keep cool and moist.", shelfLifeDays: 3,
  },
  {
    id: "P-TAL-S", sku: "SF-TAL-S", name: "Talaba / Oyster", localName: "Talaba", variant: "Shucked meat",
    category: "seafood", subcategory: "Shellfish", unit: "kg", loadFactor: 1.6,
    cost: 225, wholesalePrice: 290, sellingPrice: 320, origin: "Pagbilao, Quezon", flow: "outbound",
    grade: "Restaurant grade", icon: "shell", moq: 10, status: "low-stock",
    description: "Hand-shucked oyster meat, packed in food-grade tubs. For restaurants making sisig, soup and okoy.",
    packaging: ["2 kg tubs, iced"], storage: "Keep at 0–4 °C.", shelfLifeDays: 2,
  },
  {
    id: "P-ALI-F", sku: "SF-ALI-F", name: "Alimango / Mud Crab", localName: "Alimango", variant: "Female, with aligue",
    category: "seafood", subcategory: "Crabs", unit: "kg", loadFactor: 1.8,
    cost: 520, wholesalePrice: 650, sellingPrice: 720, origin: "Calauag & Guinayangan, Quezon", flow: "outbound",
    grade: "Grade A — 2–3 pcs/kg", icon: "crab", moq: 5,
    description: "Live mangrove mud crabs, bound and packed in damp sacks. Female crabs with rich aligue for restaurants and events.",
    packaging: ["Live, bound, in ventilated crates"], storage: "Keep cool (15–20 °C) and damp. Do not ice directly.", shelfLifeDays: 3,
  },
  {
    id: "P-ALI-M", sku: "SF-ALI-M", name: "Alimango / Mud Crab", localName: "Alimango", variant: "Male, meaty",
    category: "seafood", subcategory: "Crabs", unit: "kg", loadFactor: 1.8,
    cost: 450, wholesalePrice: 560, sellingPrice: 620, origin: "Calauag, Quezon", flow: "outbound",
    grade: "Grade A — 2–3 pcs/kg", icon: "crab", moq: 5, status: "seasonal",
    description: "Live male mud crabs with heavy claws. Best for chili crab and steamed dishes.",
    packaging: ["Live, bound, in ventilated crates"], storage: "Keep cool and damp.", shelfLifeDays: 3,
  },
  {
    id: "P-BAN", sku: "SF-BAN", name: "Bangus / Milkfish", localName: "Bangus", variant: "Regular (3–4 pcs/kg)",
    category: "seafood", subcategory: "Fish", unit: "kg", loadFactor: 1.6,
    cost: 142, wholesalePrice: 182, sellingPrice: 200, origin: "Padre Burgos & Pagbilao, Quezon", flow: "outbound",
    grade: "Class A", icon: "fish", moq: 30,
    description: "Fresh bangus from brackish-water ponds in Padre Burgos. Harvested at night and iced in banyera.",
    packaging: ["Banyera with ice (≈40 kg net)"], storage: "Keep at 0–4 °C.", shelfLifeDays: 2,
  },
  {
    id: "P-BAN-XL", sku: "SF-BAN-XL", name: "Bangus / Milkfish", localName: "Bangus", variant: "Jumbo (1–2 pcs/kg)",
    category: "seafood", subcategory: "Fish", unit: "kg", loadFactor: 1.6,
    cost: 168, wholesalePrice: 214, sellingPrice: 235, origin: "Padre Burgos, Quezon", flow: "outbound",
    grade: "Jumbo — for rellenong bangus & daing", icon: "fish", moq: 20,
    description: "Jumbo bangus for restaurants and processors (daing, relleno, sinigang sa miso).",
    packaging: ["Banyera with ice (≈40 kg net)"], storage: "Keep at 0–4 °C.", shelfLifeDays: 2,
  },
  {
    id: "P-TIL", sku: "SF-TIL", name: "Tilapia", localName: "Tilapia", variant: "Regular (3–5 pcs/kg)",
    category: "seafood", subcategory: "Fish", unit: "kg", loadFactor: 1.6,
    cost: 92, wholesalePrice: 124, sellingPrice: 138, origin: "Tayabas, Quezon", flow: "outbound",
    grade: "Class A", icon: "fish", moq: 30,
    description: "Freshwater tilapia from Tayabas inland ponds. A dependable palengke staple.",
    packaging: ["Banyera with ice (≈40 kg net)"], storage: "Keep at 0–4 °C.", shelfLifeDays: 2,
  },
  {
    id: "P-PUS", sku: "SF-PUS", name: "Pusit / Squid", localName: "Pusit", variant: "Medium",
    category: "seafood", subcategory: "Cephalopods", unit: "kg", loadFactor: 1.6,
    cost: 218, wholesalePrice: 278, sellingPrice: 305, origin: "Dalahican Fish Port, Lucena", flow: "outbound",
    grade: "Class A", icon: "squid", moq: 20,
    description: "Squid landed at Dalahican Fish Port in the early morning. Good for adobo, ihaw and calamares.",
    packaging: [ICED], storage: "Keep at 0–4 °C.", shelfLifeDays: 2,
  },
  {
    id: "P-TUL", sku: "SF-TUL", name: "Tulingan / Bullet Tuna", localName: "Tulingan", variant: "Whole",
    category: "seafood", subcategory: "Fish", unit: "kg", loadFactor: 1.6,
    cost: 138, wholesalePrice: 176, sellingPrice: 195, origin: "Dalahican Fish Port, Lucena", flow: "outbound",
    grade: "Class A", icon: "fish", moq: 30,
    description: "Bullet tuna from Tayabas Bay, landed at Dalahican. Classic for paksiw and ginataang tulingan.",
    packaging: ["Banyera with ice (≈40 kg net)"], storage: "Keep at 0–4 °C.", shelfLifeDays: 2,
  },
  // ── Agricultural produce ────────────────────────────────────────────────
  {
    id: "P-ONR", sku: "AG-ONR", name: "Red Onion", localName: "Sibuyas Pula", variant: "Local, medium bulbs",
    category: "produce", subcategory: "Onion & Garlic", unit: "kg", loadFactor: 1,
    cost: 85, wholesalePrice: 106, sellingPrice: 120, origin: "Nueva Ecija (via Valenzuela & Divisoria)", flow: "backhaul",
    grade: "Class A — 4–6 cm bulbs", icon: "onion", moq: 50,
    description: "Local red onions from Nueva Ecija growers, bought at Valenzuela and Divisoria on the return leg and hauled back to Lucena.",
    packaging: ["25 kg net mesh sacks"], storage: "Dry, ventilated bodega. Keep off the floor on pallets.", shelfLifeDays: 45,
  },
  {
    id: "P-ONW", sku: "AG-ONW", name: "White Onion", localName: "Sibuyas Puti", variant: "Medium bulbs",
    category: "produce", subcategory: "Onion & Garlic", unit: "kg", loadFactor: 1,
    cost: 80, wholesalePrice: 100, sellingPrice: 115, origin: "Nueva Ecija (via Valenzuela)", flow: "backhaul",
    grade: "Class A", icon: "onion", moq: 50,
    description: "White onions for restaurants, caterers and grocery retail in Quezon Province.",
    packaging: ["25 kg net mesh sacks"], storage: "Dry, ventilated bodega.", shelfLifeDays: 40,
  },
  {
    id: "P-GAR", sku: "AG-GAR", name: "Garlic", localName: "Bawang", variant: "Bulk, large cloves",
    category: "produce", subcategory: "Onion & Garlic", unit: "kg", loadFactor: 1,
    cost: 92, wholesalePrice: 126, sellingPrice: 142, origin: "Divisoria & Valenzuela traders", flow: "backhaul",
    grade: "Class A", icon: "garlic", moq: 25,
    description: "Bulk garlic sourced from Divisoria and Valenzuela traders on the return trip.",
    packaging: ["20 kg net mesh sacks"], storage: "Dry, ventilated bodega.", shelfLifeDays: 60,
  },
  {
    id: "P-GAR-N", sku: "AG-GAR-N", name: "Garlic", localName: "Bawang Tagalog", variant: "Native, small cloves",
    category: "produce", subcategory: "Onion & Garlic", unit: "kg", loadFactor: 1,
    cost: 148, wholesalePrice: 178, sellingPrice: 196, origin: "Ilocos (via Divisoria)", flow: "backhaul",
    grade: "Native", icon: "garlic", moq: 10, status: "low-stock",
    description: "Native Ilocos garlic — smaller cloves, stronger aroma. Preferred by some restaurants and longganisa makers.",
    packaging: ["10 kg net mesh sacks"], storage: "Dry, ventilated bodega.", shelfLifeDays: 90,
  },
  {
    id: "P-GIN", sku: "AG-GIN", name: "Ginger / Luya", localName: "Luya", variant: "Native",
    category: "produce", subcategory: "Root Crops & Spices", unit: "kg", loadFactor: 1,
    cost: 88, wholesalePrice: 122, sellingPrice: 140, origin: "Amadeo, Cavite & Laguna", flow: "backhaul",
    grade: "Class A — mature rhizomes", icon: "ginger", moq: 25,
    description: "Native luya from Cavite and Laguna highland farms. Picked up on the Cavite–Laguna return leg.",
    packaging: ["25 kg net sacks"], storage: "Cool, dry, ventilated.", shelfLifeDays: 30,
  },
  {
    id: "P-TOM", sku: "AG-TOM", name: "Tomato", localName: "Kamatis", variant: "Native, semi-ripe",
    category: "produce", subcategory: "Vegetables", unit: "kg", loadFactor: 1.08,
    cost: 42, wholesalePrice: 58, sellingPrice: 68, origin: "Batangas & Laguna", flow: "backhaul",
    grade: "Class A", icon: "tomato", moq: 50,
    description: "Semi-ripe native tomatoes packed in kaing/crates to survive the trip to Lucena.",
    packaging: ["Plastic crates (≈20 kg)"], storage: "Cool, shaded. Do not stack more than 6 crates.", shelfLifeDays: 7,
  },
  {
    id: "P-POT", sku: "AG-POT", name: "Potato", localName: "Patatas", variant: "Benguet, medium",
    category: "produce", subcategory: "Vegetables", unit: "kg", loadFactor: 1,
    cost: 58, wholesalePrice: 76, sellingPrice: 86, origin: "Benguet (via Balintawak)", flow: "backhaul",
    grade: "Class A", icon: "potato", moq: 50,
    description: "Benguet potatoes consolidated at Balintawak and Calamba.",
    packaging: ["50 kg net sacks"], storage: "Cool, dark, ventilated.", shelfLifeDays: 30,
  },
  {
    id: "P-CAR", sku: "AG-CAR", name: "Carrots", localName: "Karot", variant: "Benguet",
    category: "produce", subcategory: "Vegetables", unit: "kg", loadFactor: 1,
    cost: 54, wholesalePrice: 72, sellingPrice: 82, origin: "Benguet (via Balintawak)", flow: "backhaul",
    grade: "Class A", icon: "carrot", moq: 50,
    description: "Benguet carrots for groceries, carinderias and caterers.",
    packaging: ["50 kg net sacks"], storage: "Cool, ventilated.", shelfLifeDays: 20,
  },
  {
    id: "P-CAB", sku: "AG-CAB", name: "Cabbage", localName: "Repolyo", variant: "Benguet, round",
    category: "produce", subcategory: "Vegetables", unit: "kg", loadFactor: 1.05,
    cost: 38, wholesalePrice: 54, sellingPrice: 62, origin: "Benguet (via Calamba)", flow: "backhaul",
    grade: "Class A", icon: "cabbage", moq: 50,
    description: "Round cabbage wrapped in newspaper and packed in sacks.",
    packaging: ["Sacks (≈30 kg)"], storage: "Cool, ventilated.", shelfLifeDays: 14,
  },
  {
    id: "P-CAL", sku: "AG-CAL", name: "Calamansi", localName: "Kalamansi", variant: "Green, medium",
    category: "produce", subcategory: "Fruits", unit: "kg", loadFactor: 1.05,
    cost: 48, wholesalePrice: 68, sellingPrice: 80, origin: "Oriental Mindoro (via Batangas)", flow: "backhaul",
    grade: "Class A", icon: "citrus", moq: 25,
    description: "Mindoro calamansi picked up at Batangas City consolidators.",
    packaging: ["Plastic crates (≈25 kg)"], storage: "Cool, shaded.", shelfLifeDays: 10,
  },
  {
    id: "P-NIY", sku: "AG-NIY", name: "Niyog / Mature Coconut", localName: "Niyog", variant: "Dehusked, per piece",
    category: "produce", subcategory: "Quezon Produce", unit: "pc", unitWeightKg: 1.2, loadFactor: 1,
    cost: 16, wholesalePrice: 24, sellingPrice: 28, origin: "Tiaong & Candelaria, Quezon", flow: "outbound",
    grade: "Class A — for gata and kakanin", icon: "coconut", moq: 100, bulkThreshold: 1000,
    description: "Mature dehusked coconuts from Quezon — the coconut capital. Sold per piece to palengke gata vendors and kakanin makers.",
    packaging: ["Sacks of 50 pcs"], storage: "Dry, shaded.", shelfLifeDays: 21,
  },
  {
    id: "P-SAB", sku: "AG-SAB", name: "Saging na Saba", localName: "Saba", variant: "Per kg, green-ripe",
    category: "produce", subcategory: "Quezon Produce", unit: "kg", loadFactor: 1.02,
    cost: 22, wholesalePrice: 32, sellingPrice: 38, origin: "Candelaria, Quezon", flow: "outbound",
    grade: "Class A", icon: "banana", moq: 100,
    description: "Saba bananas from Candelaria farms, hauled green-ripe for turon and banana-cue vendors.",
    packaging: ["Bundled bunches in crates"], storage: "Shaded, ventilated.", shelfLifeDays: 7,
  },
  {
    id: "P-KAM", sku: "AG-KAM", name: "Kamote / Sweet Potato", localName: "Kamote", variant: "Orange flesh",
    category: "produce", subcategory: "Quezon Produce", unit: "kg", loadFactor: 1,
    cost: 28, wholesalePrice: 40, sellingPrice: 48, origin: "Sariaya, Quezon", flow: "outbound",
    grade: "Class A", icon: "sweet-potato", moq: 100,
    description: "Orange-flesh kamote from Sariaya farms.",
    packaging: ["50 kg sacks"], storage: "Cool, dry.", shelfLifeDays: 21,
  },
  {
    id: "P-SIL", sku: "AG-SIL", name: "Siling Haba", localName: "Siling Pansigang", variant: "Finger chili",
    category: "produce", subcategory: "Vegetables", unit: "kg", loadFactor: 1.05,
    cost: 92, wholesalePrice: 130, sellingPrice: 150, origin: "Lucban, Quezon", flow: "outbound",
    grade: "Class A", icon: "chili", moq: 10, status: "seasonal",
    description: "Finger chilies from Lucban highland farms — a must for sinigang and paksiw.",
    packaging: ["10 kg crates"], storage: "Cool, shaded.", shelfLifeDays: 7,
  },
];

export const PRODUCTS: Product[] = RAW.map((p) => ({
  status: "active",
  unitWeightKg: 1,
  moq: 20,
  bulkThreshold: 100,
  ...p,
  slug: slugify(`${p.name.split("/")[0]} ${p.variant ?? ""}`),
}));

const productMap = new Map(PRODUCTS.map((p) => [p.id, p]));
export const productById = (id: string) => productMap.get(id)!;
export const productBySlug = (slug: string) => PRODUCTS.find((p) => p.slug === slug);

/** Short display label, e.g. "Sugpo (Large)". */
export function productLabel(p: Product) {
  const base = p.localName ?? p.name;
  const v = p.variant?.split(/[,(]/)[0].trim();
  return v ? `${base} — ${v}` : base;
}
