// GENERATED from trade-route-frontend/lib/selectors.ts by scripts/sync-domain.mjs. Do not edit here:
// change the frontend file and run `npm run domain:sync`.
/**
 * Trading module selectors (product sales, stock). Logistics selectors live in lib/logistics.ts.
 */
import type { Customer, InventoryBatch, Order, ProductStock, PurchaseOrder, SalesInvoice, SalesPayment } from "../types";

export type { ProductStock };
import { TODAY } from "../data/company";
import { PRODUCTS, productById } from "../data/products";
import { SALES_LIFETIME_BASELINE } from "../data/finance";
import { agingBucket, buildSalesInvoices, itemNetKg, orderBilledAmount, orderCost, type AgingBucket } from "./calc";
import { memoizeLast } from "./collections";

export const OPEN_STATUSES = ["Pending Confirmation", "Confirmed", "Preparing", "Ready for Dispatch"] as const;
export const isOpen = (o: Order) => (OPEN_STATUSES as readonly string[]).includes(o.status);
export const isRevenue = (o: Order) => o.status === "Delivered" || o.status === "Partially Delivered";
export const isLive = (o: Order) => o.status !== "Cancelled" && o.status !== "Draft";

export const getSalesInvoices = memoizeLast((orders: Order[], payments: SalesPayment[]) => buildSalesInvoices(orders, payments));
export const getSalesInvoiceMap = memoizeLast((invoices: SalesInvoice[]) => new Map(invoices.map((i) => [i.orderId, i])));

// ─── Customers (product sales) ──────────────────────────────────────────────
export interface SalesCustomerStats {
  orders: number;
  windowSales: number;
  lifetimeSales: number;
  avgOrder: number;
  lastOrder?: string;
  outstanding: number;
  overdue: number;
  oldestOverdueDays: number;
  ordersPerWeek: number;
  aging: Record<AgingBucket, number>;
}
const emptyAging = (): Record<AgingBucket, number> => ({ current: 0, d1_7: 0, d8_30: 0, d31_60: 0, d60p: 0 });

export const getSalesCustomerStats = memoizeLast((customers: Customer[], orders: Order[], invoices: SalesInvoice[]) => {
  const map = new Map<string, SalesCustomerStats>();
  for (const c of customers)
    map.set(c.id, { orders: 0, windowSales: 0, lifetimeSales: SALES_LIFETIME_BASELINE[c.id] ?? 0, avgOrder: 0, outstanding: 0, overdue: 0, oldestOverdueDays: 0, ordersPerWeek: 0, aging: emptyAging() });
  for (const o of orders) {
    const s = map.get(o.customerId);
    if (!s || !isLive(o)) continue;
    s.orders += 1;
    if (!s.lastOrder || o.deliveryDate > s.lastOrder) s.lastOrder = o.deliveryDate;
    if (isRevenue(o) && !o.notes?.startsWith("Opening balance")) {
      const amt = orderBilledAmount(o);
      s.windowSales += amt;
      s.lifetimeSales += amt;
    }
  }
  for (const inv of invoices) {
    const s = map.get(inv.customerId);
    if (!s || inv.balance <= 0) continue;
    s.outstanding += inv.balance;
    s.aging[agingBucket(inv.daysOverdue)] += inv.balance;
    if (inv.daysOverdue > 0) {
      s.overdue += inv.balance;
      s.oldestOverdueDays = Math.max(s.oldestOverdueDays, inv.daysOverdue);
    }
  }
  for (const s of map.values()) {
    s.avgOrder = s.orders ? s.windowSales / s.orders : 0;
    s.ordersPerWeek = s.orders / (30 / 7);
  }
  return map;
});

// ─── Inventory ──────────────────────────────────────────────────────────────
export const getStockMap = memoizeLast((inventory: InventoryBatch[], orders: Order[], pos: PurchaseOrder[]) => {
  const m = new Map<string, ProductStock>();
  for (const p of PRODUCTS) m.set(p.id, { productId: p.id, onHand: 0, damaged: 0, reserved: 0, demand: 0, available: 0, incoming: 0, inTransit: 0, value: 0, shortage: 0 });
  for (const b of inventory) {
    if (b.location !== "Lucena Main Warehouse") continue;
    const s = m.get(b.productId)!;
    s.onHand += b.onHand;
    s.damaged += b.damaged;
    s.value += (b.onHand - b.damaged) * b.unitCost;
  }
  for (const o of orders) {
    if (o.status === "Out for Delivery") {
      for (const i of o.items) m.get(i.productId)!.inTransit += i.quantity;
      continue;
    }
    if (!isOpen(o) || o.deliveryDate < TODAY) continue;
    for (const i of o.items) m.get(i.productId)!.demand += i.quantity;
  }
  for (const p of pos) {
    if (!["Sent", "Confirmed", "Ready for Pickup", "Picked Up"].includes(p.status)) continue;
    for (const i of p.items) m.get(i.productId)!.incoming += i.quantity;
  }
  for (const s of m.values()) {
    const usable = s.onHand - s.damaged;
    s.reserved = Math.min(usable, s.demand);
    s.available = usable - s.reserved;
    s.shortage = Math.max(0, s.demand - usable - s.incoming);
  }
  return m;
});

// ─── Aggregates ─────────────────────────────────────────────────────────────
export const getDailyRevenue = memoizeLast((orders: Order[]) => {
  const m = new Map<string, { date: string; revenue: number; cost: number; orders: number }>();
  for (const o of orders) {
    if (!isRevenue(o) || o.notes?.startsWith("Opening balance")) continue;
    const d = o.deliveryDate;
    const row = m.get(d) ?? { date: d, revenue: 0, cost: 0, orders: 0 };
    row.revenue += orderBilledAmount(o);
    row.cost += orderCost(o);
    row.orders += 1;
    m.set(d, row);
  }
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
});

export const getProductSales = memoizeLast((orders: Order[]) => {
  const m = new Map<string, { productId: string; revenue: number; quantity: number; kg: number }>();
  for (const o of orders) {
    if (!isRevenue(o)) continue;
    for (const i of o.items) {
      const q = i.deliveredQty ?? i.quantity;
      const row = m.get(i.productId) ?? { productId: i.productId, revenue: 0, quantity: 0, kg: 0 };
      row.revenue += q * i.unitPrice;
      row.quantity += q;
      row.kg += itemNetKg({ productId: i.productId, quantity: q });
      m.set(i.productId, row);
    }
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue);
});

/** Product families used on dashboards ("Sugpo" rolls up all sizes). */
export function productFamily(productId: string) {
  const p = productById(productId);
  return p.localName === "Hipon" ? "Hipon" : p.localName === "Bawang" || p.localName === "Bawang Tagalog" ? "Garlic" : p.localName === "Sibuyas Pula" ? "Red Onion" : p.localName === "Sibuyas Puti" ? "White Onion" : p.localName === "Luya" ? "Ginger" : (p.localName ?? p.name);
}
