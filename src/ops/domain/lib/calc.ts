// GENERATED from trade-route-frontend/lib/calc.ts by scripts/sync-domain.mjs. Do not edit here:
// change the frontend file and run `npm run domain:sync`.
import { differenceInCalendarDays, parseISO } from "date-fns";
import type { Order, OrderItem, PaymentStatus, PaymentTerms, PurchaseOrder, SalesInvoice, SalesPayment } from "../types";
import { productById } from "../data/products";
import { TODAY } from "../data/company";

// ─── Trading: order math ─────────────────────────────────────────────────────────────
export const itemAmount = (i: OrderItem) => i.quantity * i.unitPrice;
export const itemDeliveredAmount = (i: OrderItem) => (i.deliveredQty ?? i.quantity) * i.unitPrice;

export const orderSubtotal = (o: Pick<Order, "items">) => o.items.reduce((s, i) => s + itemAmount(i), 0);
export const orderTotal = (o: Pick<Order, "items" | "discount" | "deliveryFee">) => orderSubtotal(o) - o.discount + o.deliveryFee;
/** Amount actually billed — uses delivered quantities for partial deliveries. */
export const orderBilledAmount = (o: Order) =>
  o.items.reduce((s, i) => s + itemDeliveredAmount(i), 0) - o.discount + o.deliveryFee;

export const orderCost = (o: Pick<Order, "items">) =>
  o.items.reduce((s, i) => s + (i.deliveredQty ?? i.quantity) * productById(i.productId).cost, 0);

/** Net product weight in kg (pieces converted using unit weight). */
export const itemNetKg = (i: { productId: string; quantity: number }) => {
  const p = productById(i.productId);
  return i.quantity * p.unitWeightKg;
};
/** Truck load weight in kg, including ice, boxes and sacks. */
export const itemLoadKg = (i: { productId: string; quantity: number }) => {
  const p = productById(i.productId);
  return i.quantity * p.unitWeightKg * p.loadFactor;
};
export const orderNetKg = (o: Pick<Order, "items">) => o.items.reduce((s, i) => s + itemNetKg(i), 0);
export const orderLoadKg = (o: Pick<Order, "items">) => Math.round(o.items.reduce((s, i) => s + itemLoadKg(i), 0));

export const poTotal = (po: Pick<PurchaseOrder, "items">) => po.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
export const poKg = (po: Pick<PurchaseOrder, "items">) => po.items.reduce((s, i) => s + itemNetKg(i), 0);
export const poLoadKg = (po: Pick<PurchaseOrder, "items">) => Math.round(po.items.reduce((s, i) => s + itemLoadKg(i), 0));

// ─── Terms ──────────────────────────────────────────────────────────────────
export function termsDays(t: PaymentTerms) {
  switch (t) {
    case "Credit 7 Days":
      return 7;
    case "Credit 15 Days":
      return 15;
    case "Credit 30 Days":
      return 30;
    case "50% Down, Balance on Arrival":
      return 4;
    default:
      return 0;
  }
}
export const isCreditTerms = (t: PaymentTerms) => t.startsWith("Credit");

// ─── Trading: sales invoices ───────────────────────────────────────────────────────────────
export const invoiceIdForOrder = (orderId: string) => orderId.replace("FR-", "SI-");
export const orderIdForInvoice = (invoiceId: string) => invoiceId.replace("SI-", "FR-");

/** An order is invoiced once delivered (or handed to the sea-freight partner). */
export function isInvoiced(o: Order) {
  if (o.status === "Delivered" || o.status === "Partially Delivered") return true;
  if (o.fulfillment === "partner" && o.status === "Out for Delivery") return true;
  return false;
}

function addDaysISO(iso: string, n: number) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function invoiceIssueDate(o: Order) {
  return o.deliveredAt ? o.deliveredAt.slice(0, 10) : o.deliveryDate;
}

export function buildSalesInvoices(orders: Order[], payments: SalesPayment[], today = TODAY): SalesInvoice[] {
  const paidByInvoice = new Map<string, number>();
  for (const p of payments) paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + p.amount);
  const out: SalesInvoice[] = [];
  for (const o of orders) {
    if (!isInvoiced(o)) continue;
    const id = invoiceIdForOrder(o.id);
    const total = orderBilledAmount(o);
    const paid = Math.min(total, paidByInvoice.get(id) ?? 0);
    const issueDate = invoiceIssueDate(o);
    const dueDate = addDaysISO(issueDate, termsDays(o.paymentTerms));
    const balance = Math.max(0, total - paid);
    const daysOverdue = balance > 0 ? Math.max(0, differenceInCalendarDays(parseISO(today), parseISO(dueDate))) : 0;
    out.push({
      id,
      orderId: o.id,
      customerId: o.customerId,
      issueDate,
      dueDate,
      total,
      paid,
      balance,
      daysOverdue,
      status: balance <= 0 ? "Paid" : daysOverdue > 0 ? "Overdue" : paid > 0 ? "Partial" : "Current",
    });
  }
  return out;
}

export function paymentStatusFor(o: Order, invoice: SalesInvoice | undefined): PaymentStatus {
  if (invoice) {
    if (invoice.balance <= 0) return "Paid";
    if (invoice.paid > 0) return "Partial";
    if (isCreditTerms(o.paymentTerms) && invoice.daysOverdue === 0) return "Credit";
    return "Unpaid";
  }
  return isCreditTerms(o.paymentTerms) ? "Credit" : "Unpaid";
}

export type AgingBucket = "current" | "d1_7" | "d8_30" | "d31_60" | "d60p";
export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return "current";
  if (daysOverdue <= 7) return "d1_7";
  if (daysOverdue <= 30) return "d8_30";
  if (daysOverdue <= 60) return "d31_60";
  return "d60p";
}
