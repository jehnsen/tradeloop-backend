// GENERATED from trade-route-frontend/data/suppliers.ts by scripts/sync-domain.mjs. Do not edit here:
// change the frontend file and run `npm run domain:sync`.
import type { AreaId, Supplier, SupplierQuote, SupplierType } from "../types";
import { areaById } from "./areas";

type Row = [
  id: string,
  name: string,
  type: SupplierType,
  area: AreaId,
  line1: string,
  brgy: string,
  pickup: string,
  pickupArea: AreaId,
  contact: string,
  phone: string,
  products: string[],
  terms: Supplier["paymentTerms"],
  reliability: number,
  detourKm: number,
  since: string,
  notes: string,
  status?: Supplier["status"],
];

const ROWS: Row[] = [
  // Seafood sources — Quezon (deliver to Lucena bodega before loading)
  ["SUP-001", "Quezon Coastal Seafood Cooperative", "Seafood Source", "pagbilao", "Coop Bldg., Coastal Rd.", "Brgy. Binahaan", "Delivers to Lucena bodega", "pagbilao", "Nestor Ilagan", "0917 204 8836", ["P-SUG-L", "P-SUG-M", "P-HIP-S", "P-HIP-W", "P-BAN"], "Credit 7 Days", 96, 0, "2023-01-05", "Primary sugpo source. 120 member fishpond operators.", "preferred"],
  ["SUP-002", "Tayabas Aquaculture Supply", "Seafood Source", "tayabas", "Sitio Malaking Bato", "Brgy. Ibabang Palale", "Delivers to Lucena bodega", "tayabas", "Rommel Mendiola", "0918 330 6614", ["P-SUG-J", "P-SUG-L", "P-TIL", "P-BAN"], "Credit 7 Days", 93, 0, "2023-02-20", "Jumbo sugpo specialist.", "preferred"],
  ["SUP-003", "Dalahican Fish Port Traders", "Wholesale Market", "lucena", "Dalahican Fish Port Complex", "Brgy. Dalahican", "Dalahican Fish Port, Lucena", "lucena", "Eduardo Salvacion", "0927 816 4403", ["P-PUS", "P-TUL", "P-ALI-F"], "Cash on Pickup", 88, 0, "2023-01-05", "Morning auction (bagsakan). Prices move daily."],
  ["SUP-004", "Pagbilao Tahong & Talaba Growers Association", "Seafood Source", "pagbilao", "Coastal Rd., Sitio Pantalan", "Brgy. Ibabang Palsabangon", "Delivers to Lucena bodega", "pagbilao", "Felicisimo Gonzales", "0919 118 2205", ["P-TAH", "P-TAH-C", "P-TAL", "P-TAL-S"], "Credit 7 Days", 94, 0, "2023-03-11", "Main tahong/talaba source. Needs 1-day advance notice for cleaned tahong.", "preferred"],
  ["SUP-005", "Padre Burgos Fishpond Operators", "Seafood Source", "pagbilao", "Brgy. Basiao", "Brgy. Basiao, Padre Burgos", "Delivers to Lucena bodega", "pagbilao", "Susana Catapang", "0935 441 0716", ["P-BAN", "P-BAN-XL"], "Credit 7 Days", 91, 0, "2023-05-02", "Bangus harvest schedule every Tue/Thu/Sat."],
  ["SUP-006", "Calauag Mangrove Crab Farmers Coop", "Seafood Source", "lucena", "Brgy. Sumulong", "Brgy. Sumulong, Calauag", "Delivers to Lucena bodega (2× weekly)", "lucena", "Isidro Valenzuela", "0917 552 9024", ["P-ALI-F", "P-ALI-M"], "Cash on Pickup", 86, 0, "2023-08-18", "Crab supply thins out during habagat season."],
  ["SUP-007", "Atimonan Bay Fishermen's Association", "Seafood Source", "lucena", "Brgy. Poblacion", "Brgy. Poblacion, Atimonan", "Dalahican Fish Port, Lucena", "lucena", "Carlito Obciana", "0998 305 7712", ["P-TUL", "P-PUS"], "Cash on Pickup", 82, 0, "2024-02-14", ""],
  ["SUP-008", "Sariaya Prawn Farms", "Seafood Source", "sariaya", "Sitio Ilaya", "Brgy. Castañas", "Delivers to Lucena bodega", "sariaya", "Benjamin Maaño", "0917 663 0184", ["P-SUG-J", "P-SUG-L", "P-HIP-W"], "Credit 7 Days", 90, 0, "2024-01-30", ""],
  // Quezon farm suppliers (outbound produce)
  ["SUP-009", "Tiaong Coconut Traders", "Farm Supplier", "candelaria", "Maharlika Hwy.", "Brgy. Lumingon, Tiaong", "Delivers to Lucena bodega", "candelaria", "Gregorio Añonuevo", "0918 227 5503", ["P-NIY"], "Cash on Pickup", 92, 0, "2023-06-12", "Dehusked niyog, 50 pcs per sack."],
  ["SUP-010", "Candelaria Saba Growers", "Farm Supplier", "candelaria", "Sitio Bukal", "Brgy. Mangilag Sur", "Delivers to Lucena bodega", "candelaria", "Teodora Lagdameo", "0936 770 2248", ["P-SAB", "P-KAM"], "Cash on Pickup", 89, 0, "2023-09-04", ""],
  ["SUP-011", "Lucban Highland Farms", "Farm Supplier", "tayabas", "Sitio Kulapi", "Brgy. Kulapi, Lucban", "Delivers to Lucena bodega", "tayabas", "Arsenio Racelis", "0927 400 1837", ["P-SIL", "P-TOM"], "Cash on Pickup", 84, 0, "2024-03-18", "Siling haba is seasonal."],
  // Backhaul sources — Metro Manila
  ["SUP-012", "Valenzuela Produce Depot", "Agricultural Trader", "valenzuela", "Bodega 7, Paso de Blas Rd. (near NLEX exit)", "Brgy. Paso de Blas", "Paso de Blas, Valenzuela City", "valenzuela", "Marcelino Tiu", "0917 815 3302", ["P-ONR", "P-ONW", "P-GAR", "P-GIN"], "Credit 7 Days", 95, 2, "2023-02-01", "Best backhaul partner — beside NLEX, no Divisoria traffic. Ready by 12:00 NN.", "preferred"],
  ["SUP-013", "Divisoria Agri Trading", "Agricultural Trader", "manila", "618 Sto. Cristo St.", "Brgy. 268, Binondo", "Sto. Cristo St., Divisoria, Manila", "manila", "Wilson Chua", "0918 332 7710", ["P-ONR", "P-ONW", "P-GAR", "P-GAR-N", "P-GIN"], "Cash on Pickup", 88, 9, "2023-02-01", "Good prices but heavy truck traffic after 10 AM. Truck ban window applies."],
  ["SUP-014", "North Metro Agricultural Supply", "Agricultural Trader", "caloocan", "Km. 12 MacArthur Hwy.", "Brgy. 176 (Bagumbong)", "MacArthur Hwy., Caloocan", "caloocan", "Dante Villaruel", "0927 505 6619", ["P-ONR", "P-GAR", "P-GIN", "P-POT"], "Credit 7 Days", 90, 5, "2023-10-09", ""],
  ["SUP-015", "Bodega ni Mang Tony", "Wholesale Market", "manila", "Stall 12, Tabora St.", "Brgy. 267, Divisoria", "Tabora St., Divisoria, Manila", "manila", "Antonio \"Mang Tony\" Sarmiento", "0919 740 3310", ["P-ONR", "P-ONW", "P-GAR"], "Cash on Pickup", 85, 10, "2023-04-15", "Cheapest onions in Divisoria but stock is inconsistent."],
  ["SUP-016", "Balintawak Vegetable Wholesalers", "Wholesale Market", "quezon-city", "Balintawak Market, EDSA", "Brgy. Apolonio Samson", "Balintawak Market, Quezon City", "quezon-city", "Precious Mangubat", "0917 214 8807", ["P-POT", "P-CAR", "P-CAB", "P-TOM"], "Cash on Pickup", 87, 4, "2023-07-07", "Benguet vegetables arrive at dawn."],
  ["SUP-017", "Nueva Ecija Onion Growers Consolidated", "Farm Supplier", "valenzuela", "Bongabon, Nueva Ecija (drop-off at Paso de Blas)", "Brgy. Paso de Blas", "Paso de Blas drop point, Valenzuela", "valenzuela", "Rolando Esteban", "0918 604 2291", ["P-ONR", "P-ONW"], "GCash on Pickup", 91, 2, "2024-05-20", "Direct-from-grower red onion. Drop-off truck arrives 11 AM."],
  ["SUP-018", "Ilocos Garlic Traders", "Agricultural Trader", "manila", "Divisoria Mall Area, Recto Ave.", "Brgy. 268, Binondo", "Recto Ave., Divisoria", "manila", "Evelyn Ramirez", "0917 309 2275", ["P-GAR-N", "P-GAR"], "Cash on Pickup", 83, 9, "2024-01-11", ""],
  // Backhaul sources — CALABARZON
  ["SUP-019", "Batangas Vegetable Consolidators", "Agricultural Trader", "batangas-city", "Diversion Rd.", "Brgy. Balagtas", "Diversion Rd., Batangas City", "batangas-city", "Rodelio Marasigan", "0918 720 5536", ["P-TOM", "P-CAL", "P-GIN"], "Cash on Pickup", 89, 3, "2023-11-02", ""],
  ["SUP-020", "Laguna Highland Produce Hub", "Distributor", "calamba", "Parian Bagsakan", "Brgy. Parian", "Parian, Calamba", "calamba", "Emerson Lajara", "0917 802 4418", ["P-GIN", "P-POT", "P-CAR", "P-CAB"], "Credit 7 Days", 92, 1, "2023-05-15", "", "preferred"],
  ["SUP-021", "Cavite Agri Hub Dasmariñas", "Agricultural Trader", "dasmarinas", "Governor's Drive", "Brgy. Paliparan III", "Governor's Drive, Dasmariñas", "dasmarinas", "Joy Ambrosio", "0927 216 0934", ["P-TOM", "P-GIN", "P-ONR"], "Cash on Pickup", 86, 3, "2024-04-09", ""],
  ["SUP-022", "Amadeo Luya Growers", "Farm Supplier", "dasmarinas", "Brgy. Banaybanay, Amadeo", "Brgy. Banaybanay", "Consolidation at Dasmariñas", "dasmarinas", "Crisanto Bayot", "0936 115 7206", ["P-GIN"], "Cash on Pickup", 90, 6, "2024-06-03", "Freshest native luya — harvest days vary."],
  ["SUP-023", "Mindoro Calamansi Traders", "Distributor", "batangas-city", "Batangas Port Rd.", "Brgy. Sta. Clara", "Batangas Port area", "batangas-city", "Norberto Villas", "0918 440 6627", ["P-CAL"], "Cash on Pickup", 84, 4, "2024-08-22", ""],
  ["SUP-024", "Benguet Vegetable Direct", "Distributor", "quezon-city", "Balintawak Cloverleaf", "Brgy. Balingasa", "Balintawak Cloverleaf, QC", "quezon-city", "Hermie Kidang", "0917 663 2108", ["P-POT", "P-CAR", "P-CAB"], "GCash on Pickup", 88, 4, "2024-09-30", ""],
  ["SUP-025", "Santa Rosa Agri Wholesale", "Wholesale Market", "santa-rosa", "Santa Rosa Bagsakan, Old National Hwy.", "Brgy. Tagapo", "Tagapo, Santa Rosa", "santa-rosa", "Michelle Arcilla", "0928 331 8850", ["P-ONR", "P-ONW", "P-GAR", "P-GIN"], "Credit 7 Days", 90, 2, "2024-02-08", ""],
];

export const SUPPLIERS: Supplier[] = ROWS.map((r) => {
  const area = areaById(r[3]);
  return {
    id: r[0],
    name: r[1],
    type: r[2],
    address: { line1: r[4], barangay: r[5], city: area.name, province: area.province, areaId: r[3] },
    pickupLocation: r[6],
    pickupAreaId: r[7],
    contactPerson: r[8],
    phone: r[9],
    productIds: r[10],
    paymentTerms: r[11],
    reliability: r[12],
    detourKm: r[13],
    status: r[16] ?? "active",
    since: r[14],
    notes: r[15],
  };
});

const supplierMap = new Map(SUPPLIERS.map((s) => [s.id, s]));
export const supplierById = (id: string) => supplierMap.get(id)!;

/** Today's quotes gathered by procurement (via calls and Messenger) for backhaul produce. */
export const SUPPLIER_QUOTES: SupplierQuote[] = [
  // Red onion
  { id: "Q-01", supplierId: "SUP-012", productId: "P-ONR", availableQty: 3000, quotedPrice: 85, quotedAt: "2026-09-25T05:40", validUntil: "2026-09-26" },
  { id: "Q-02", supplierId: "SUP-013", productId: "P-ONR", availableQty: 5000, quotedPrice: 82, quotedAt: "2026-09-25T06:05", validUntil: "2026-09-25" },
  { id: "Q-03", supplierId: "SUP-015", productId: "P-ONR", availableQty: 1500, quotedPrice: 80, quotedAt: "2026-09-25T06:20", validUntil: "2026-09-25" },
  { id: "Q-04", supplierId: "SUP-017", productId: "P-ONR", availableQty: 2500, quotedPrice: 83, quotedAt: "2026-09-24T19:10", validUntil: "2026-09-26" },
  { id: "Q-05", supplierId: "SUP-014", productId: "P-ONR", availableQty: 1200, quotedPrice: 86, quotedAt: "2026-09-25T06:45", validUntil: "2026-09-26" },
  { id: "Q-06", supplierId: "SUP-025", productId: "P-ONR", availableQty: 2000, quotedPrice: 87, quotedAt: "2026-09-25T07:00", validUntil: "2026-09-26" },
  // White onion
  { id: "Q-07", supplierId: "SUP-012", productId: "P-ONW", availableQty: 1500, quotedPrice: 80, quotedAt: "2026-09-25T05:40", validUntil: "2026-09-26" },
  { id: "Q-08", supplierId: "SUP-013", productId: "P-ONW", availableQty: 2000, quotedPrice: 78, quotedAt: "2026-09-25T06:05", validUntil: "2026-09-25" },
  { id: "Q-09", supplierId: "SUP-025", productId: "P-ONW", availableQty: 1000, quotedPrice: 81, quotedAt: "2026-09-25T07:00", validUntil: "2026-09-26" },
  // Garlic
  { id: "Q-10", supplierId: "SUP-012", productId: "P-GAR", availableQty: 1200, quotedPrice: 90, quotedAt: "2026-09-25T05:40", validUntil: "2026-09-26" },
  { id: "Q-11", supplierId: "SUP-013", productId: "P-GAR", availableQty: 2500, quotedPrice: 88, quotedAt: "2026-09-25T06:05", validUntil: "2026-09-25" },
  { id: "Q-12", supplierId: "SUP-015", productId: "P-GAR", availableQty: 800, quotedPrice: 86, quotedAt: "2026-09-25T06:20", validUntil: "2026-09-25" },
  { id: "Q-13", supplierId: "SUP-014", productId: "P-GAR", availableQty: 600, quotedPrice: 92, quotedAt: "2026-09-25T06:45", validUntil: "2026-09-26" },
  { id: "Q-14", supplierId: "SUP-018", productId: "P-GAR-N", availableQty: 300, quotedPrice: 148, quotedAt: "2026-09-24T17:30", validUntil: "2026-09-26" },
  // Ginger
  { id: "Q-15", supplierId: "SUP-012", productId: "P-GIN", availableQty: 600, quotedPrice: 92, quotedAt: "2026-09-25T05:40", validUntil: "2026-09-26" },
  { id: "Q-16", supplierId: "SUP-020", productId: "P-GIN", availableQty: 900, quotedPrice: 86, quotedAt: "2026-09-25T06:30", validUntil: "2026-09-26" },
  { id: "Q-17", supplierId: "SUP-022", productId: "P-GIN", availableQty: 700, quotedPrice: 84, quotedAt: "2026-09-24T18:15", validUntil: "2026-09-26" },
  { id: "Q-18", supplierId: "SUP-014", productId: "P-GIN", availableQty: 500, quotedPrice: 90, quotedAt: "2026-09-25T06:45", validUntil: "2026-09-26" },
  // Vegetables
  { id: "Q-19", supplierId: "SUP-020", productId: "P-POT", availableQty: 1500, quotedPrice: 58, quotedAt: "2026-09-25T06:30", validUntil: "2026-09-26" },
  { id: "Q-20", supplierId: "SUP-016", productId: "P-POT", availableQty: 2000, quotedPrice: 56, quotedAt: "2026-09-25T05:15", validUntil: "2026-09-25" },
  { id: "Q-21", supplierId: "SUP-024", productId: "P-POT", availableQty: 1200, quotedPrice: 57, quotedAt: "2026-09-25T05:50", validUntil: "2026-09-26" },
  { id: "Q-22", supplierId: "SUP-020", productId: "P-CAR", availableQty: 800, quotedPrice: 54, quotedAt: "2026-09-25T06:30", validUntil: "2026-09-26" },
  { id: "Q-23", supplierId: "SUP-016", productId: "P-CAB", availableQty: 1000, quotedPrice: 36, quotedAt: "2026-09-25T05:15", validUntil: "2026-09-25" },
  { id: "Q-24", supplierId: "SUP-019", productId: "P-TOM", availableQty: 900, quotedPrice: 42, quotedAt: "2026-09-25T06:10", validUntil: "2026-09-25" },
  { id: "Q-25", supplierId: "SUP-019", productId: "P-CAL", availableQty: 400, quotedPrice: 48, quotedAt: "2026-09-25T06:10", validUntil: "2026-09-26" },
];
