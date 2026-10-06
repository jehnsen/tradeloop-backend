/**
 * Trading module demo data (Phase 2 preview): product sales orders, purchase orders,
 * inventory batches and sales payments.
 *
 * The generator still simulates truck runs internally so order timing and stock levels look
 * realistic, but those runs are NOT exported — trips, cargo and freight billing belong to the
 * logistics model (see logistics-seed.ts). Exported orders and POs carry no trip links.
 */
import { addDays, addMinutes, format, getDay, parseISO } from 'date-fns';
import type {
  Customer,
  CustomerType,
  InventoryBatch,
  Order,
  OrderEvent,
  OrderItem,
  OrderSource,
  OrderStatus,
  Product,
  PurchaseOrder,
  POItem,
  QuoteRequest,
  SalesPayment,
  SalesPaymentMethod,
  Weekday,
} from '../domain/types';
import { NOW, TODAY, TOMORROW, staffById } from '../domain/data/company';
import { areaById, INTER_ISLAND_PARTNER, routeById } from '../domain/data/areas';
import { PRODUCTS, productById } from '../domain/data/products';
import { TRADING_CUSTOMERS as CUSTOMERS, customerById, STANDING_ORDERS } from './customers';
import { SUPPLIERS, supplierById } from '../domain/data/suppliers';
import { TRUCKS, driverById, truckById } from '../domain/data/fleet';
import {
  invoiceIdForOrder,
  isCreditTerms,
  itemLoadKg,
  orderBilledAmount,
  orderNetKg,
  termsDays,
} from '../domain/lib/calc';

/** Generates the trading (Phase 2 preview) records. Run after the demo tenant profile is applied. */
export function generateTradingSeed() {
  /** Internal-only truck run used to time orders; never exported. */
  interface SimTrip {
    id: string;
    date: string;
    truckId: string;
    driverId: string;
    helperIds: string[];
    routeId: string;
    status: 'Planned' | 'Loading' | 'In Transit' | 'Completed';
    departure: string;
    actualDeparture?: string;
    expectedReturn: string;
    actualReturn?: string;
    notes?: string;
  }
  interface SimDelivery {
    id: string;
    orderId: string;
    tripId: string;
    stopSeq: number;
    status: string;
    eta: string;
    arrivedAt?: string;
    completedAt?: string;
    pod?: { receivedBy: string; signedAt: string; photoCount: number; remarks?: string };
    failureReason?: string;
  }
  type SimOrder = Order & { tripId?: string };
  type SimPO = PurchaseOrder & { tripId?: string };
  type Trip = SimTrip;
  type Delivery = SimDelivery;

  // ─── Deterministic helpers ──────────────────────────────────────────────────
  function mulberry32(seed: number) {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = mulberry32(20260925);
  const rint = (a: number, b: number) => Math.floor(rand() * (b - a + 1)) + a;
  const rfloat = (a: number, b: number) => a + rand() * (b - a);
  const chance = (p: number) => rand() < p;
  const pick = <T>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const shuffle = <T>(arr: T[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);
  const pad = (n: number, w = 3) => String(n).padStart(w, '0');

  const fmtD = (d: Date) => format(d, 'yyyy-MM-dd');
  const fmtDT = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
  const addDaysISO = (iso: string, n: number) => fmtD(addDays(parseISO(iso), n));
  const at = (iso: string, hhmm: string) => `${iso}T${hhmm}`;
  const plusMin = (dt: string, m: number) => fmtDT(addMinutes(parseISO(dt), m));
  const yymmdd = (iso: string) => iso.slice(2, 10).replace(/-/g, '');
  const weekdayOf = (iso: string) => getDay(parseISO(iso)); // 0 = Sunday
  const WEEKDAY_NAMES: Weekday[] = [
    'Monday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const randTime = (iso: string, fromH: number, toH: number) =>
    at(iso, `${pad(rint(fromH, toH), 2)}:${pad(rint(0, 59), 2)}`);

  // ─── Output collections ─────────────────────────────────────────────────────
  const orders: SimOrder[] = [];
  const trips: Trip[] = [];
  const deliveries: Delivery[] = [];
  const purchaseOrders: SimPO[] = [];
  const rawPayments: Omit<SalesPayment, 'id' | 'receiptNo'>[] = [];

  const orderSeq = new Map<string, number>();
  const poSeq = new Map<string, number>();
  const nextOrderId = (date: string) => {
    const n = (orderSeq.get(date) ?? 0) + 1;
    orderSeq.set(date, n);
    return `FR-${yymmdd(date)}-${pad(n)}`;
  };
  const nextPoId = (createdDate: string) => {
    const n = (poSeq.get(createdDate) ?? 0) + 1;
    poSeq.set(createdDate, n);
    return `PO-${yymmdd(createdDate)}-${pad(n)}`;
  };

  const DISPATCHER = 'Noel Pascual';
  const WAREHOUSE = 'Bong Esguerra';
  const PROCUREMENT = 'Edwin Manalo';
  const ACCOUNTING = 'Grace Lontoc';

  // ─── Scheduling rules ───────────────────────────────────────────────────────
  const START = '2026-08-26';
  const TRUCK_PATTERN: Record<string, Record<number, string>> = {
    'TRK-01': { 1: 'RT-NV', 2: 'RT-MNL', 3: 'RT-NV', 4: 'RT-NCQ', 5: 'RT-NV', 6: 'RT-NV' },
    'TRK-02': { 1: 'RT-CAV', 2: 'RT-LAG', 3: 'RT-BAT', 4: 'RT-SOU', 5: 'RT-CAV', 6: 'RT-SOU' },
  };
  const TRUCK_DOWN: Record<string, string[]> = {
    'TRK-01': ['2026-09-14'],
    'TRK-02': ['2026-09-10'],
  };
  const HELPERS_BY_TRUCK: Record<string, string[]> = {
    'TRK-01': ['HL-01', 'HL-02'],
    'TRK-02': ['HL-03', 'HL-04'],
  };
  function driverFor(truckId: string, date: string) {
    const wd = weekdayOf(date);
    if (truckId === 'TRK-01') return wd === 2 || wd === 6 ? 'DRV-03' : 'DRV-01';
    return wd === 3 || wd === 6 ? 'DRV-04' : 'DRV-02';
  }

  // ─── Order building blocks ──────────────────────────────────────────────────
  const QTY_RANGE: Record<CustomerType, [number, number]> = {
    'Seafood Dealer': [140, 420],
    Distributor: [250, 800],
    'Palengke Vendor': [60, 240],
    Restaurant: [30, 110],
    Hotel: [30, 80],
    Resort: [30, 80],
    'Catering Company': [40, 140],
    Grocery: [60, 220],
    Retailer: [100, 350],
    'Agri Trader': [200, 600],
    Cooperative: [200, 600],
    'General Merchandise': [100, 300],
  };
  const QTY_MULT: Record<string, number> = {
    'P-SUG-J': 0.35,
    'P-SUG-L': 0.42,
    'P-SUG-M': 0.45,
    'P-HIP-S': 0.45,
    'P-HIP-W': 0.4,
    'P-ALI-F': 0.15,
    'P-ALI-M': 0.15,
    'P-TAH': 2.2,
    'P-TAH-C': 0.8,
    'P-TAL': 1.0,
    'P-TAL-S': 0.3,
    'P-BAN': 1.1,
    'P-BAN-XL': 0.7,
    'P-TIL': 1.0,
    'P-PUS': 0.5,
    'P-TUL': 0.7,
    'P-NIY': 7,
    'P-SAB': 3,
    'P-KAM': 2,
    'P-GAR-N': 0.4,
    'P-GIN': 0.6,
    'P-SIL': 0.2,
  };
  const PRICE_FACTOR: Record<CustomerType, [number, number]> = {
    'Seafood Dealer': [0.99, 1.02],
    Distributor: [0.98, 1.01],
    'Palengke Vendor': [1.0, 1.04],
    Restaurant: [1.03, 1.08],
    Hotel: [1.04, 1.08],
    Resort: [1.03, 1.07],
    'Catering Company': [1.02, 1.06],
    Grocery: [1.0, 1.04],
    Retailer: [1.0, 1.03],
    'Agri Trader': [0.99, 1.02],
    Cooperative: [0.99, 1.02],
    'General Merchandise': [1.0, 1.03],
  };

  function qtyFor(c: Customer, p: Product) {
    const [lo, hi] = QTY_RANGE[c.type];
    const q = rfloat(lo, hi) * (QTY_MULT[p.id] ?? 1);
    if (p.unit === 'pc') return roundTo(q, 50);
    return roundTo(q, q >= 200 ? 50 : q >= 60 ? 10 : 5);
  }
  function priceFor(c: Customer, p: Product) {
    const [lo, hi] = PRICE_FACTOR[c.type];
    const raw = Math.min(p.sellingPrice, p.wholesalePrice * rfloat(lo, hi));
    return raw >= 100 ? Math.round(raw / 5) * 5 : Math.round(raw);
  }
  function standingFor(c: Customer, date: string) {
    const day = WEEKDAY_NAMES[weekdayOf(date)];
    return STANDING_ORDERS.find(
      (s) => s.customerId === c.id && s.day === day && s.status === 'active' && s.startDate <= date,
    );
  }
  function itemsFor(c: Customer, date: string): { items: OrderItem[]; standing: boolean } {
    const so = standingFor(c, date);
    if (so) {
      const items = so.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: priceFor(c, productById(l.productId)),
      }));
      if (chance(0.35)) {
        const extra = c.preferredProductIds.find((id) => !items.some((i) => i.productId === id));
        if (extra)
          items.push({
            productId: extra,
            quantity: qtyFor(c, productById(extra)),
            unitPrice: priceFor(c, productById(extra)),
          });
      }
      return { items, standing: true };
    }
    const prefs = c.preferredProductIds;
    const minK = c.type === 'Restaurant' || c.type === 'Hotel' ? 2 : 1;
    const k = Math.min(prefs.length, rint(minK, 3));
    const chosen = chance(0.75)
      ? [prefs[0], ...shuffle(prefs.slice(1)).slice(0, k - 1)]
      : shuffle(prefs).slice(0, k);
    return {
      items: chosen.map((id) => {
        const p = productById(id);
        return { productId: id, quantity: qtyFor(c, p), unitPrice: priceFor(c, p) };
      }),
      standing: false,
    };
  }

  const SOURCE_WEIGHTS: [OrderSource, number][] = [
    ['Facebook Messenger', 36],
    ['Phone', 26],
    ['Repeat Order', 12],
    ['Customer Portal', 12],
    ['Salesperson', 11],
    ['Facebook Lead', 3],
  ];
  function sourceFor(c: Customer, standing: boolean): OrderSource {
    if (standing) return 'Repeat Order';
    if (c.leadSource === 'Messenger' && chance(0.4)) return 'Facebook Messenger';
    const total = SOURCE_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let r = rand() * total;
    for (const [src, w] of SOURCE_WEIGHTS) {
      r -= w;
      if (r <= 0) return src;
    }
    return 'Phone';
  }
  const sourceActor = (src: OrderSource, c: Customer) => {
    switch (src) {
      case 'Customer Portal':
        return `${c.contacts[0].name} (portal)`;
      case 'Repeat Order':
        return 'System — standing order';
      case 'Facebook Messenger':
        return `${staffById(c.salespersonId)!.name} via Messenger`;
      case 'Facebook Lead':
        return `${staffById(c.salespersonId)!.name} (from FB lead)`;
      default:
        return staffById(c.salespersonId)!.name;
    }
  };

  function baseOrder(
    c: Customer,
    id: string,
    date: string,
    items: OrderItem[],
    source: OrderSource,
    createdAt: string,
  ): SimOrder {
    const addr = c.addresses[0];
    const createdBy = sourceActor(source, c);
    return {
      id,
      customerId: c.id,
      source,
      items,
      discount: 0,
      deliveryFee: c.deliveryFee,
      status: 'Confirmed',
      paymentTerms: c.paymentTerms,
      addressId: addr.id,
      createdAt,
      deliveryDate: date,
      deliveryWindow: addr.receivingHours,
      fulfillment: c.fulfillment,
      salespersonId: c.salespersonId,
      history: [
        {
          at: createdAt,
          label:
            source === 'Customer Portal'
              ? 'Order submitted via Customer Portal'
              : `Order recorded (${source})`,
          by: createdBy,
        },
      ],
    };
  }

  function applyWholesaleDiscount(o: Order) {
    const sub = o.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
    if (sub >= 150000 && chance(0.4)) o.discount = Math.round((sub * 0.01) / 100) * 100;
  }

  const confirmEvent = (o: Order, minutes: number): OrderEvent => ({
    at: plusMin(o.createdAt, minutes),
    label: 'Order confirmed',
    by: staffById(o.salespersonId)!.name,
    note: 'Stock and delivery slot confirmed with customer.',
  });

  // ─── Trip generation ────────────────────────────────────────────────────────
  interface TripPlan {
    trip: Trip;
    orders: SimOrder[];
    pos: SimPO[];
  }

  function tripId(date: string, truckId: string) {
    return `TRIP-${yymmdd(date)}-${truckId === 'TRK-01' ? '01' : '02'}`;
  }

  function planTruckOrders(truckId: string, date: string, routeId: string, usedToday: Set<string>) {
    const route = routeById(routeId);
    const cap = truckById(truckId).capacityKg;
    const candidates = CUSTOMERS.filter(
      (c) =>
        c.fulfillment === 'truck' &&
        route.outboundAreas.includes(c.areaId) &&
        c.customerSince <= date &&
        c.status !== 'inactive' &&
        !usedToday.has(c.id),
    ).sort((a, b) => route.outboundAreas.indexOf(a.areaId) - route.outboundAreas.indexOf(b.areaId));

    const drafts: { c: Customer; items: OrderItem[]; standing: boolean }[] = [];
    for (const c of candidates) {
      const hasStanding = !!standingFor(c, date);
      // Accounts with overdue balances are kept on a short leash (credit hold after two drops a week).
      const includeChance = c.paymentBehavior === 'delinquent' ? 0.2 : 0.28 + c.frequency * 0.065;
      if (hasStanding || chance(includeChance)) {
        drafts.push({ c, ...itemsFor(c, date) });
        usedToday.add(c.id);
      }
    }
    const loadOf = (items: OrderItem[]) => items.reduce((s, i) => s + itemLoadKg(i), 0);
    const BULK_BUYERS: CustomerType[] = [
      'Seafood Dealer',
      'Distributor',
      'Palengke Vendor',
      'Grocery',
      'Retailer',
    ];
    // A dispatcher never sends a 10-wheeler without at least one bulk anchor account.
    if (!drafts.some((d) => d.c.type === 'Seafood Dealer' || d.c.type === 'Distributor')) {
      const anchor = candidates
        .filter(
          (c) => (c.type === 'Seafood Dealer' || c.type === 'Distributor') && !usedToday.has(c.id),
        )
        .sort((a, b) => b.frequency - a.frequency)[0];
      if (anchor) {
        drafts.push({ c: anchor, ...itemsFor(anchor, date) });
        usedToday.add(anchor.id);
        drafts.sort(
          (a, b) =>
            route.outboundAreas.indexOf(a.c.areaId) - route.outboundAreas.indexOf(b.c.areaId),
        );
      }
    }
    const target = cap * rfloat(0.78, 0.95);
    let load = drafts.reduce((s, d) => s + loadOf(d.items), 0);
    // 1) Top up bulk, low-value lines (tahong, bangus, tilapia, niyog, saba) — that is what fills a Quezon truck.
    const isBulk = (i: OrderItem) => productById(i.productId).wholesalePrice < 200;
    const scalable = drafts.filter((d) => !d.standing && BULK_BUYERS.includes(d.c.type));
    const scalableLoad = scalable.reduce((s, d) => s + loadOf(d.items.filter(isBulk)), 0);
    if (load < target && scalableLoad > 0) {
      const f = Math.min(3, 1 + (target - load) / scalableLoad);
      for (const d of scalable)
        for (const i of d.items.filter(isBulk)) {
          const p = productById(i.productId);
          i.quantity =
            p.unit === 'pc'
              ? roundTo(i.quantity * f, 50)
              : roundTo(i.quantity * f, i.quantity * f >= 200 ? 50 : 10);
        }
    }
    // 2) Still light? Add Quezon niyog and saba "pasabay" to the biggest bulk buyer on the route.
    load = drafts.reduce((s, d) => s + loadOf(d.items), 0);
    if (load < target * 0.95) {
      const host =
        [...drafts]
          .filter((d) => BULK_BUYERS.includes(d.c.type))
          .sort((a, b) => loadOf(b.items) - loadOf(a.items))[0] ?? drafts[0];
      if (host) {
        const gap = target - load;
        const addLine = (pid: string, qty: number) => {
          if (qty <= 0) return;
          const existing = host.items.find((i) => i.productId === pid);
          if (existing) existing.quantity += qty;
          else
            host.items.push({
              productId: pid,
              quantity: qty,
              unitPrice: priceFor(host.c, productById(pid)),
            });
        };
        addLine('P-NIY', Math.min(3000, roundTo((gap * 0.6) / 1.2, 50)));
        addLine('P-SAB', Math.min(1500, roundTo((gap * 0.4) / 1.02, 50)));
      }
    }
    load = drafts.reduce((s, d) => s + loadOf(d.items), 0);
    while (load > cap * 0.97 && drafts.length > 1) {
      const idx = drafts.findLastIndex((d) => !d.standing);
      const [removed] = drafts.splice(idx >= 0 ? idx : drafts.length - 1, 1);
      usedToday.delete(removed.c.id);
      load = drafts.reduce((s, d) => s + loadOf(d.items), 0);
    }
    return drafts;
  }

  function buildHistoricTrip(truckId: string, date: string, usedToday: Set<string>): TripPlan {
    const routeId = TRUCK_PATTERN[truckId][weekdayOf(date)];
    const route = routeById(routeId);
    const id = tripId(date, truckId);
    const driverId = driverFor(truckId, date);
    const driver = driverById(driverId);
    const drafts = planTruckOrders(truckId, date, routeId, usedToday);

    const departure = at(date, route.departure);
    const actualDeparture = plusMin(departure, rint(0, 14));
    const trip: Trip = {
      id,
      date,
      truckId,
      driverId,
      helperIds: HELPERS_BY_TRUCK[truckId],
      routeId,
      status: 'Completed',
      departure,
      actualDeparture,
      expectedReturn: at(date, route.expectedReturn),
    };

    const tripOrders: SimOrder[] = [];
    let t = plusMin(actualDeparture, areaById(route.outboundAreas[0]).driveMinutes + rint(-10, 25));
    let prevArea = route.outboundAreas[0];
    let seq = 0;
    for (const d of drafts) {
      const o = baseOrder(
        d.c,
        nextOrderId(date),
        date,
        d.items,
        sourceFor(d.c, d.standing),
        d.standing ? randTime(addDaysISO(date, -3), 6, 6) : randTime(addDaysISO(date, -1), 11, 21),
      );
      if (
        d.c.customerSince > addDaysISO(START, -60) &&
        ['Facebook Group', 'Facebook Page', 'Facebook Marketplace'].includes(d.c.leadSource) &&
        chance(0.4)
      )
        o.source = 'Facebook Lead';
      applyWholesaleDiscount(o);
      o.history.push(confirmEvent(o, rint(8, 70)));

      // ~2% of orders get cancelled before loading (customer postponed / stall closed)
      if (chance(0.02)) {
        o.status = 'Cancelled';
        o.cancelReason = pick([
          'Customer postponed — stall closed for the day',
          'Customer found stock locally',
          'Duplicate order via Messenger and phone',
        ]);
        o.history.push({
          at: randTime(addDaysISO(date, -1), 20, 22),
          label: 'Order cancelled',
          by: staffById(o.salespersonId)!.name,
          note: o.cancelReason,
        });
        orders.push(o);
        continue;
      }

      if (d.c.areaId !== prevArea) {
        t = plusMin(t, rint(20, 38));
        prevArea = d.c.areaId;
      }
      seq += 1;
      const arrivedAt = t;
      const completedAt = plusMin(arrivedAt, rint(12, 28));
      t = plusMin(completedAt, rint(5, 12));
      o.tripId = id;
      o.history.push({
        at: randTime(addDaysISO(date, -1), 17, 19),
        label: `Assigned to ${id}`,
        by: DISPATCHER,
      });
      o.history.push({
        at: plusMin(departure, -45),
        label: `Loaded to ${truckById(truckId).code}`,
        by: WAREHOUSE,
      });
      o.history.push({ at: actualDeparture, label: 'Out for delivery', by: driver.name });

      const partial = chance(0.03) && o.items.length > 1;
      if (partial) {
        const it = o.items[o.items.length - 1];
        it.deliveredQty = roundTo(it.quantity * rfloat(0.8, 0.92), 5);
        o.status = 'Partially Delivered';
        o.history.push({
          at: completedAt,
          label: 'Partially delivered',
          by: driver.name,
          note: `${productById(it.productId).localName} short by ${it.quantity - it.deliveredQty} ${productById(it.productId).unit} — rejected on receiving (quality).`,
        });
      } else {
        o.status = 'Delivered';
        o.history.push({ at: completedAt, label: 'Delivered', by: driver.name });
      }
      o.deliveredAt = completedAt;
      const contact = d.c.contacts[d.c.contacts.length > 1 && chance(0.4) ? 1 : 0];
      deliveries.push({
        id: o.id.replace('FR-', 'DLV-'),
        orderId: o.id,
        tripId: id,
        stopSeq: seq,
        status: 'Delivered',
        eta: plusMin(arrivedAt, rint(-20, 15)),
        arrivedAt,
        completedAt,
        pod: {
          receivedBy: contact.name,
          signedAt: completedAt,
          photoCount: rint(1, 3),
          remarks: partial ? 'Partial acceptance noted on DR.' : undefined,
        },
      });
      orders.push(o);
      tripOrders.push(o);
    }

    // Backhaul purchase orders on the return leg
    const pos = buildBackhaulPOs(trip, route.returnAreas, true, t);
    const lastPickup = pos.length ? pos[pos.length - 1].pickedUpAt! : t;
    trip.actualReturn = plusMin(
      lastPickup,
      areaById(route.returnAreas[route.returnAreas.length - 1]).driveMinutes + rint(10, 50),
    );
    trips.push(trip);
    return { trip, orders: tripOrders, pos };
  }

  const BACKHAUL_PRODUCTS = new Set(PRODUCTS.filter((p) => p.flow === 'backhaul').map((p) => p.id));

  function buildBackhaulPOs(
    trip: Trip,
    returnAreas: string[],
    received: boolean,
    afterTime: string,
  ) {
    const cap = truckById(trip.truckId).capacityKg;
    const target = cap * rfloat(0.34, 0.82);
    const pool = SUPPLIERS.filter(
      (s) =>
        returnAreas.includes(s.pickupAreaId) &&
        s.productIds.some((id) => BACKHAUL_PRODUCTS.has(id)),
    );
    const ranked = shuffle(pool).sort(
      (a, b) => (b.status === 'preferred' ? 1 : 0) - (a.status === 'preferred' ? 1 : 0),
    );
    const suppliers = ranked.slice(0, Math.min(ranked.length, rint(1, 2)));
    const pos: SimPO[] = [];
    let t = plusMin(afterTime, rint(25, 50));
    suppliers.forEach((s, idx) => {
      const share = suppliers.length === 1 ? 1 : idx === 0 ? 0.62 : 0.38;
      const prods = shuffle(s.productIds.filter((id) => BACKHAUL_PRODUCTS.has(id))).slice(
        0,
        rint(2, 3),
      );
      const weights = prods.map((id) =>
        id === 'P-ONR' ? 3 : id === 'P-GAR' || id === 'P-POT' ? 2 : 1,
      );
      const wsum = weights.reduce((a, b) => a + b, 0);
      const items: POItem[] = prods.map((id, i) => {
        const p = productById(id);
        const quantity = roundTo((target * share * weights[i]) / wsum / p.loadFactor, 50);
        const unitCost = Math.round(p.cost * rfloat(0.95, 1.05));
        return { productId: id, quantity, unitCost, receivedQty: received ? quantity : undefined };
      });
      const created = addDaysISO(trip.date, -1);
      const partial = received && chance(0.05);
      if (partial) items[0].receivedQty = roundTo(items[0].quantity * 0.9, 25);
      const pickedUpAt = t;
      t = plusMin(t, rint(40, 70));
      pos.push({
        id: nextPoId(created),
        supplierId: s.id,
        items,
        status: received ? (partial ? 'Partially Received' : 'Received') : 'Confirmed',
        createdAt: randTime(created, 15, 20),
        pickupDate: trip.date,
        pickupLocation: s.pickupLocation,
        pickupAreaId: s.pickupAreaId,
        tripId: trip.id,
        pickupEta: pickedUpAt,
        pickedUpAt: received ? pickedUpAt : undefined,
        receivedAt: received ? plusMin(pickedUpAt, 300) : undefined,
        createdBy: PROCUREMENT,
        notes: partial ? 'Short by one sack on receiving — supplier to credit next PO.' : undefined,
      });
    });
    purchaseOrders.push(...pos);
    return pos;
  }

  /** Local supply POs: seafood and Quezon produce delivered to the Lucena bodega before loading. */
  function buildOutboundSupplyPOs(
    forDate: string,
    dayOrders: SimOrder[],
    opts: { status: PurchaseOrder['status']; shortfall?: Record<string, number> },
  ) {
    const need = new Map<string, number>();
    for (const o of dayOrders) {
      if (o.status === 'Cancelled' || o.status === 'Draft') continue;
      for (const i of o.items) {
        const p = productById(i.productId);
        if (p.flow !== 'outbound') continue;
        need.set(p.id, (need.get(p.id) ?? 0) + i.quantity);
      }
    }
    const bySupplier = new Map<string, POItem[]>();
    for (const [pid, qty] of need) {
      const candidates = SUPPLIERS.filter(
        (s) =>
          s.productIds.includes(pid) &&
          ['lucena', 'pagbilao', 'tayabas', 'sariaya', 'candelaria'].includes(s.pickupAreaId),
      );
      const s = candidates.find((c) => c.status === 'preferred') ?? candidates[0];
      const p = productById(pid);
      const buffer = opts.status === 'Received' ? rfloat(1.02, 1.06) : 1;
      let quantity = p.unit === 'pc' ? roundTo(qty * buffer, 50) : roundTo(qty * buffer, 10);
      if (opts.shortfall?.[pid]) quantity -= opts.shortfall[pid];
      const list = bySupplier.get(s.id) ?? [];
      list.push({
        productId: pid,
        quantity,
        unitCost: Math.round(p.cost * rfloat(0.97, 1.03)),
        receivedQty: opts.status === 'Received' ? quantity : undefined,
      });
      bySupplier.set(s.id, list);
    }
    const created = addDaysISO(forDate, -1);
    const pos: SimPO[] = [];
    for (const [sid, items] of bySupplier) {
      const s = supplierById(sid);
      const arrival = randTime(forDate, 0, 2);
      pos.push({
        id: nextPoId(created),
        supplierId: sid,
        items,
        status: opts.status,
        createdAt: opts.status === 'Received' ? randTime(created, 19, 22) : randTime(created, 6, 7),
        pickupDate: forDate,
        pickupLocation: s.pickupLocation,
        pickupAreaId: s.pickupAreaId,
        deliveredBySupplier: true,
        pickupEta: arrival,
        receivedAt: opts.status === 'Received' ? arrival : undefined,
        createdBy: PROCUREMENT,
      });
    }
    purchaseOrders.push(...pos);
    return pos;
  }

  // ─── Pickup (bodega) & inter-island orders ──────────────────────────────────
  function buildPickupOrders(date: string) {
    const pickupCustomers = CUSTOMERS.filter(
      (c) => c.fulfillment === 'pickup' && c.customerSince <= date,
    );
    for (const c of pickupCustomers) {
      const standing = !!standingFor(c, date);
      if (!standing && !chance(0.2 + c.frequency * 0.06)) continue;
      const { items } = itemsFor(c, date);
      const o = baseOrder(
        c,
        nextOrderId(date),
        date,
        items,
        sourceFor(c, standing),
        randTime(addDaysISO(date, -1), 9, 20),
      );
      o.history.push(confirmEvent(o, rint(10, 60)));
      const pickedAt = randTime(date, 5, 11);
      o.history.push({ at: plusMin(pickedAt, -30), label: 'Prepared at bodega', by: WAREHOUSE });
      o.history.push({
        at: pickedAt,
        label: 'Picked up at bodega',
        by: WAREHOUSE,
        note: `Released to ${c.contacts[0].name}`,
      });
      o.status = 'Delivered';
      o.deliveredAt = pickedAt;
      orders.push(o);
    }
  }

  const PARTNER_SHIPMENTS: { customerId: string; date: string; items: [string, number][] }[] = [
    {
      customerId: 'CUS-045',
      date: '2026-08-28',
      items: [
        ['P-GIN', 800],
        ['P-ONR', 1200],
      ],
    },
    {
      customerId: 'CUS-041',
      date: '2026-09-02',
      items: [
        ['P-GIN', 1000],
        ['P-GAR', 800],
        ['P-SUG-L', 300],
      ],
    },
    {
      customerId: 'CUS-042',
      date: '2026-09-08',
      items: [
        ['P-ONR', 2000],
        ['P-GIN', 800],
        ['P-NIY', 2000],
      ],
    },
    {
      customerId: 'CUS-043',
      date: '2026-09-11',
      items: [
        ['P-SUG-L', 400],
        ['P-GIN', 500],
      ],
    },
    {
      customerId: 'CUS-041',
      date: '2026-09-16',
      items: [
        ['P-GIN', 900],
        ['P-GAR', 700],
      ],
    },
    {
      customerId: 'CUS-044',
      date: '2026-09-19',
      items: [
        ['P-ONR', 1800],
        ['P-GAR', 600],
      ],
    },
    {
      customerId: 'CUS-045',
      date: '2026-09-22',
      items: [
        ['P-GIN', 600],
        ['P-ONR', 1500],
      ],
    },
  ];

  function buildPartnerOrder(customerId: string, date: string, itemSpec: [string, number][]) {
    const c = customerById(customerId)!;
    const items = itemSpec.map(([pid, q]) => ({
      productId: pid,
      quantity: q,
      unitPrice: productById(pid).wholesalePrice,
    }));
    const o = baseOrder(
      c,
      nextOrderId(date),
      date,
      items,
      c.leadSource === 'Messenger' ? 'Facebook Messenger' : 'Salesperson',
      randTime(addDaysISO(date, -5), 9, 16),
    );
    const kg = orderNetKg(o);
    o.deliveryFee = Math.round((kg * 6.5) / 100) * 100;
    o.notes = `${INTER_ISLAND_PARTNER.note}. Reefer van freight billed at cost.`;
    o.history.push(confirmEvent(o, rint(30, 180)));
    o.history.push({
      at: randTime(date, 14, 16),
      label: `Handed over to ${INTER_ISLAND_PARTNER.name}`,
      by: WAREHOUSE,
      note: `Reefer van to ${INTER_ISLAND_PARTNER.handover}`,
    });
    const arrival = randTime(addDaysISO(date, 4), 9, 12);
    if (arrival <= NOW) {
      o.status = 'Delivered';
      o.deliveredAt = arrival;
      o.history.push({
        at: arrival,
        label: 'Delivered',
        by: `${INTER_ISLAND_PARTNER.name}`,
        note: `Received by ${c.contacts[0].name} at consignee warehouse`,
      });
    } else {
      o.status = 'Out for Delivery';
      o.history.push({
        at: randTime(addDaysISO(date, 1), 18, 20),
        label: 'Vessel departed Batangas Port',
        by: INTER_ISLAND_PARTNER.name,
      });
    }
    orders.push(o);
    return o;
  }

  // ─── HISTORY: Aug 26 → Sep 24 ───────────────────────────────────────────────
  const historicPlans: TripPlan[] = [];
  for (let date = START; date < TODAY; date = addDaysISO(date, 1)) {
    if (weekdayOf(date) === 0) continue;
    const usedToday = new Set<string>();
    const dayOrders: SimOrder[] = [];
    for (const truck of TRUCKS) {
      if (TRUCK_DOWN[truck.id].includes(date)) continue;
      const plan = buildHistoricTrip(truck.id, date, usedToday);
      historicPlans.push(plan);
      dayOrders.push(...plan.orders);
    }
    buildOutboundSupplyPOs(date, dayOrders, { status: 'Received' });
    buildPickupOrders(date);
    for (const s of PARTNER_SHIPMENTS.filter((p) => p.date === date))
      buildPartnerOrder(s.customerId, s.date, s.items);
  }

  // Opening balances migrated from the paper ledger at go-live (Aug 26). These are the only
  // receivables older than the 30-day operating window.
  const GO_LIVE_NOTE =
    'Opening balance migrated from paper ledger at TradeLoop go-live (Aug 26, 2026).';
  const OPENING: [
    customerId: string,
    date: string,
    lines: [string, number, number][],
    paid: number,
    paidOn?: string,
  ][] = [
    ['CUS-002', '2026-07-17', [['P-SUG-L', 120, 450]], 20000, '2026-09-03'],
    [
      'CUS-002',
      '2026-08-07',
      [
        ['P-SUG-L', 90, 455],
        ['P-HIP-W', 60, 330],
      ],
      0,
    ],
    [
      'CUS-020',
      '2026-08-12',
      [
        ['P-SUG-L', 60, 460],
        ['P-ALI-F', 20, 660],
      ],
      15000,
      '2026-09-12',
    ],
    [
      'CUS-026',
      '2026-07-28',
      [
        ['P-SUG-M', 70, 410],
        ['P-PUS', 40, 285],
      ],
      0,
    ],
    [
      'CUS-018',
      '2026-08-14',
      [
        ['P-TAH', 300, 112],
        ['P-SUG-M', 40, 405],
      ],
      10000,
      '2026-09-18',
    ],
  ];
  const openingOrders: { o: SimOrder; paid: number; paidOn?: string }[] = [];
  for (const [cid, date, lines, paid, paidOn] of OPENING) {
    const c = customerById(cid)!;
    const o = baseOrder(
      c,
      nextOrderId(date),
      date,
      lines.map(([productId, quantity, unitPrice]) => ({ productId, quantity, unitPrice })),
      'Salesperson',
      at(addDaysISO(date, -1), '15:00'),
    );
    o.status = 'Delivered';
    o.deliveredAt = at(date, '09:30');
    o.notes = GO_LIVE_NOTE;
    o.history = [
      {
        at: '2026-08-26T08:00',
        label: 'Migrated from paper ledger',
        by: ACCOUNTING,
        note: GO_LIVE_NOTE,
      },
    ];
    orders.push(o);
    openingOrders.push({ o, paid, paidOn });
  }

  // One historic delivery returned to Lucena — stall flooded after habagat rains.
  {
    const victim = orders.find(
      (o) => o.customerId === 'CUS-020' && o.deliveryDate === '2026-09-05' && o.tripId,
    );
    if (victim) {
      const dl = deliveries.find((d) => d.orderId === victim.id)!;
      dl.status = 'Returned';
      dl.failureReason =
        'Dampa stall closed — area flooded after overnight habagat rains. Goods returned iced and sold at Lucena bodega.';
      dl.completedAt = undefined;
      dl.pod = undefined;
      victim.status = 'Cancelled';
      victim.deliveredAt = undefined;
      victim.cancelReason = 'Returned — customer stall flooded';
      victim.history = victim.history.filter(
        (e) => e.label !== 'Delivered' && e.label !== 'Partially delivered',
      );
      victim.history.push({
        at: dl.arrivedAt!,
        label: 'Delivery failed — returned to Lucena',
        by: driverById(trips.find((t) => t.id === victim.tripId)!.driverId).name,
        note: dl.failureReason,
      });
    }
  }

  // ─── TODAY: Fri Sep 25 (clock at 07:48) ─────────────────────────────────────
  type Line = [productId: string, qty: number, price: number];
  interface Spec {
    no: string;
    customerId: string;
    lines: Line[];
    source: OrderSource;
    status: OrderStatus;
    createdAt: string;
    fee?: number;
    notes?: string;
    date?: string;
    window?: string;
  }
  function scripted(date: string, s: Spec): SimOrder {
    const c = customerById(s.customerId)!;
    const o = baseOrder(
      c,
      `FR-${yymmdd(date)}-${s.no}`,
      s.date ?? date,
      s.lines.map(([productId, quantity, unitPrice]) => ({ productId, quantity, unitPrice })),
      s.source,
      s.createdAt,
    );
    if (s.fee !== undefined) o.deliveryFee = s.fee;
    o.status = s.status;
    o.notes = s.notes;
    if (s.window) o.deliveryWindow = s.window;
    if (s.status !== 'Draft' && s.status !== 'Pending Confirmation')
      o.history.push(confirmEvent(o, 12));
    orderSeq.set(date, Math.max(orderSeq.get(date) ?? 0, Number(s.no)));
    orders.push(o);
    return o;
  }

  const T01 = 'TRIP-260925-01';
  const T02 = 'TRIP-260925-02';
  trips.push(
    {
      id: T01,
      date: TODAY,
      truckId: 'TRK-01',
      driverId: 'DRV-01',
      helperIds: ['HL-01', 'HL-02'],
      routeId: 'RT-NV',
      status: 'In Transit',
      departure: at(TODAY, '03:30'),
      actualDeparture: at(TODAY, '03:34'),
      expectedReturn: at(TODAY, '20:30'),
      notes: 'Navotas port gate congested this morning — expect +20 min on Valenzuela stops.',
    },
    {
      id: T02,
      date: TODAY,
      truckId: 'TRK-02',
      driverId: 'DRV-02',
      helperIds: ['HL-03', 'HL-04'],
      routeId: 'RT-CAV',
      status: 'Loading',
      departure: at(TODAY, '09:00'),
      expectedReturn: at(TODAY, '20:00'),
      notes: 'Late departure — waiting for the 8:00 AM sugpo harvest from Tayabas.',
    },
  );

  // Truck 01 — Lucena → Navotas → Valenzuela (in transit)
  const t01Specs: (Spec & { eta: string; done?: string; arrived?: string })[] = [
    {
      no: '001',
      customerId: 'CUS-001',
      lines: [['P-SUG-L', 350, 450]],
      source: 'Facebook Messenger',
      status: 'Delivered',
      createdAt: '2026-09-24T16:42',
      eta: '07:10',
      arrived: '07:05',
      done: '07:28',
    },
    {
      no: '018',
      customerId: 'CUS-002',
      lines: [['P-SUG-L', 180, 460]],
      source: 'Phone',
      status: 'Out for Delivery',
      createdAt: '2026-09-24T21:15',
      eta: '07:55',
      notes: 'Account has overdue balance — approved by Rodel as a one-time release.',
    },
    {
      no: '005',
      customerId: 'CUS-003',
      lines: [
        ['P-TAH', 400, 115],
        ['P-TAL', 150, 140],
      ],
      source: 'Facebook Messenger',
      status: 'Out for Delivery',
      createdAt: '2026-09-24T18:03',
      eta: '08:25',
    },
    {
      no: '010',
      customerId: 'CUS-004',
      lines: [
        ['P-TAH', 700, 112],
        ['P-TAL', 330, 138],
      ],
      source: 'Salesperson',
      status: 'Out for Delivery',
      createdAt: '2026-09-24T14:20',
      eta: '08:55',
    },
    {
      no: '006',
      customerId: 'CUS-010',
      lines: [
        ['P-HIP-S', 120, 300],
        ['P-BAN', 200, 185],
      ],
      source: 'Phone',
      status: 'Out for Delivery',
      createdAt: '2026-09-24T19:40',
      eta: '09:35',
    },
    {
      no: '002',
      customerId: 'CUS-006',
      lines: [['P-TAH', 450, 110]],
      source: 'Facebook Messenger',
      status: 'Out for Delivery',
      createdAt: '2026-09-24T20:11',
      eta: '09:55',
    },
    {
      no: '019',
      customerId: 'CUS-007',
      lines: [['P-TAH', 250, 110]],
      source: 'Facebook Messenger',
      status: 'Out for Delivery',
      createdAt: '2026-09-24T21:48',
      eta: '10:20',
    },
    {
      no: '007',
      customerId: 'CUS-008',
      lines: [
        ['P-SUG-L', 100, 455],
        ['P-TAL', 50, 140],
        ['P-HIP-S', 150, 305],
      ],
      source: 'Repeat Order',
      status: 'Out for Delivery',
      createdAt: '2026-09-22T06:00',
      eta: '10:45',
      notes:
        'Friday standing order (Sugpo 100 kg + Talaba 50 kg) plus 150 kg hipon added by phone.',
    },
    {
      no: '008',
      customerId: 'CUS-009',
      lines: [
        ['P-NIY', 2000, 24],
        ['P-SAB', 800, 32],
      ],
      source: 'Phone',
      status: 'Out for Delivery',
      createdAt: '2026-09-24T10:05',
      eta: '11:30',
    },
  ];
  const t01Orders: SimOrder[] = [];
  t01Specs.forEach((s, idx) => {
    const o = scripted(TODAY, s);
    o.tripId = T01;
    o.history.push({ at: '2026-09-24T18:30', label: `Assigned to ${T01}`, by: DISPATCHER });
    o.history.push({ at: '2026-09-25T02:50', label: 'Loaded to Truck 01', by: WAREHOUSE });
    o.history.push({ at: '2026-09-25T03:34', label: 'Out for delivery', by: 'Joel Mendoza' });
    const dl: Delivery = {
      id: o.id.replace('FR-', 'DLV-'),
      orderId: o.id,
      tripId: T01,
      stopSeq: idx + 1,
      status: idx === 0 ? 'Delivered' : idx === 1 ? 'In Transit' : 'Scheduled',
      eta: at(TODAY, s.eta),
    };
    if (s.done) {
      dl.arrivedAt = at(TODAY, s.arrived!);
      dl.completedAt = at(TODAY, s.done);
      dl.pod = {
        receivedBy: 'Lani Tan',
        signedAt: dl.completedAt,
        photoCount: 2,
        remarks: '350 kg weighed on port scale — no variance.',
      };
      o.deliveredAt = dl.completedAt;
      o.history.push({ at: dl.completedAt, label: 'Delivered', by: 'Joel Mendoza' });
    }
    deliveries.push(dl);
    t01Orders.push(o);
  });

  // Truck 02 — Lucena → Bacoor → Imus (loading at bodega)
  const t02Specs: (Spec & { eta: string })[] = [
    {
      no: '003',
      customerId: 'CUS-022',
      lines: [
        ['P-SUG-J', 120, 520],
        ['P-TAL', 80, 170],
      ],
      fee: 2000,
      source: 'Customer Portal',
      status: 'Preparing',
      createdAt: '2026-09-24T09:12',
      eta: '12:10',
    },
    {
      no: '020',
      customerId: 'CUS-023',
      lines: [
        ['P-SUG-L', 150, 500],
        ['P-TAL', 120, 170],
      ],
      fee: 1000,
      source: 'Facebook Messenger',
      status: 'Preparing',
      createdAt: '2026-09-24T22:05',
      eta: '12:40',
    },
    {
      no: '013',
      customerId: 'CUS-024',
      lines: [
        ['P-TAH', 700, 112],
        ['P-NIY', 1200, 24],
        ['P-SAB', 650, 32],
      ],
      source: 'Phone',
      status: 'Preparing',
      createdAt: '2026-09-24T15:30',
      eta: '13:10',
    },
    {
      no: '011',
      customerId: 'CUS-025',
      lines: [
        ['P-TAH', 300, 115],
        ['P-BAN', 250, 185],
        ['P-TIL', 150, 125],
      ],
      source: 'Facebook Messenger',
      status: 'Preparing',
      createdAt: '2026-09-24T19:22',
      eta: '13:45',
    },
    {
      no: '012',
      customerId: 'CUS-026',
      lines: [
        ['P-SUG-M', 100, 410],
        ['P-PUS', 60, 285],
        ['P-BAN-XL', 120, 218],
      ],
      fee: 1000,
      source: 'Phone',
      status: 'Preparing',
      createdAt: '2026-09-24T11:48',
      eta: '14:15',
      notes: 'For a Saturday wedding in Imus — deliver before 3:00 PM.',
    },
    {
      no: '014',
      customerId: 'CUS-027',
      lines: [
        ['P-SUG-L', 250, 450],
        ['P-HIP-S', 180, 300],
        ['P-BAN', 300, 182],
      ],
      source: 'Salesperson',
      status: 'Preparing',
      createdAt: '2026-09-24T13:10',
      eta: '14:40',
    },
  ];
  const t02Orders: SimOrder[] = [];
  t02Specs.forEach((s, idx) => {
    const o = scripted(TODAY, s);
    o.tripId = T02;
    o.history.push({ at: '2026-09-24T18:45', label: `Assigned to ${T02}`, by: DISPATCHER });
    o.history.push({ at: '2026-09-25T07:15', label: 'Loading started — Truck 02', by: WAREHOUSE });
    deliveries.push({
      id: o.id.replace('FR-', 'DLV-'),
      orderId: o.id,
      tripId: T02,
      stopSeq: idx + 1,
      status: 'Loading',
      eta: at(TODAY, s.eta),
    });
    t02Orders.push(o);
  });

  // Bodega pickups, a cancellation and inter-island booking
  const pickup004 = scripted(TODAY, {
    no: '004',
    customerId: 'CUS-034',
    lines: [
      ['P-ONR', 400, 108],
      ['P-GAR', 150, 128],
      ['P-GIN', 100, 125],
    ],
    source: 'Phone',
    status: 'Delivered',
    createdAt: '2026-09-24T17:20',
  });
  pickup004.deliveredAt = '2026-09-25T05:40';
  pickup004.history.push({
    at: '2026-09-25T05:40',
    label: 'Picked up at bodega',
    by: WAREHOUSE,
    note: 'Released to Josefina Merle',
  });
  const cancelled009 = scripted(TODAY, {
    no: '009',
    customerId: 'CUS-014',
    lines: [
      ['P-TAH', 150, 115],
      ['P-TIL', 80, 128],
    ],
    source: 'Facebook Messenger',
    status: 'Cancelled',
    createdAt: '2026-09-24T12:30',
  });
  cancelled009.cancelReason = 'Customer moved order to Thursday — Quezon City not on Friday routes';
  cancelled009.history.push({
    at: '2026-09-24T19:10',
    label: 'Order cancelled',
    by: 'Jerome Bautista',
    note: cancelled009.cancelReason,
  });
  scripted(TODAY, {
    no: '015',
    customerId: 'CUS-038',
    lines: [
      ['P-ONR', 150, 108],
      ['P-GAR', 50, 130],
      ['P-GIN', 30, 125],
      ['P-TOM', 100, 60],
    ],
    source: 'Facebook Messenger',
    status: 'Ready for Dispatch',
    createdAt: '2026-09-24T20:40',
    notes: 'Ready for bodega pickup at 8:30 AM.',
  }).history.push({ at: '2026-09-25T06:50', label: 'Prepared at bodega', by: WAREHOUSE });
  scripted(TODAY, {
    no: '016',
    customerId: 'CUS-035',
    lines: [
      ['P-ONR', 800, 104],
      ['P-ONW', 300, 99],
      ['P-POT', 400, 76],
    ],
    source: 'Phone',
    status: 'Preparing',
    createdAt: '2026-09-24T16:05',
    notes: 'Pickup 10:00 AM with their own 6-wheeler.',
  });
  scripted(TODAY, {
    no: '017',
    customerId: 'CUS-039',
    lines: [
      ['P-SUG-J', 40, 510],
      ['P-ALI-F', 20, 660],
      ['P-TUL', 30, 185],
    ],
    source: 'Phone',
    status: 'Confirmed',
    createdAt: '2026-09-24T15:00',
    notes: 'Hotel van arrives 9:00 AM. Vacuum-pack the sugpo.',
  });
  const cebu021 = scripted(TODAY, {
    no: '021',
    customerId: 'CUS-041',
    lines: [
      ['P-GIN', 1000, 118],
      ['P-GAR', 800, 122],
    ],
    source: 'Facebook Messenger',
    status: 'Pending Confirmation',
    createdAt: '2026-09-25T06:55',
    fee: 11700,
    notes: `${INTER_ISLAND_PARTNER.note}. Needs 50% down payment before reefer booking (Mon vessel).`,
    date: '2026-09-28',
  });
  cebu021.fulfillment = 'partner';

  // ─── TOMORROW: Sat Sep 26 — dispatch plan ───────────────────────────────────
  const D1 = 'TRIP-260926-01';
  const D2 = 'TRIP-260926-02';
  trips.push(
    {
      id: D1,
      date: TOMORROW,
      truckId: 'TRK-01',
      driverId: 'DRV-03',
      helperIds: ['HL-01', 'HL-02'],
      routeId: 'RT-NV',
      status: 'Planned',
      departure: at(TOMORROW, '03:30'),
      expectedReturn: at(TOMORROW, '20:30'),
    },
    {
      id: D2,
      date: TOMORROW,
      truckId: 'TRK-02',
      driverId: 'DRV-04',
      helperIds: ['HL-03', 'HL-04'],
      routeId: 'RT-SOU',
      status: 'Planned',
      departure: at(TOMORROW, '04:00'),
      expectedReturn: at(TOMORROW, '19:00'),
    },
  );
  const tomorrowSpecs: (Spec & { trip?: string; eta?: string })[] = [
    {
      no: '001',
      customerId: 'CUS-001',
      lines: [
        ['P-SUG-L', 300, 450],
        ['P-TAH', 500, 110],
      ],
      source: 'Facebook Messenger',
      status: 'Confirmed',
      createdAt: '2026-09-25T06:10',
      trip: D1,
      eta: '07:10',
    },
    {
      no: '002',
      customerId: 'CUS-004',
      lines: [
        ['P-TAH', 800, 112],
        ['P-TAL', 400, 138],
      ],
      source: 'Salesperson',
      status: 'Confirmed',
      createdAt: '2026-09-24T15:40',
      trip: D1,
      eta: '07:45',
    },
    {
      no: '005',
      customerId: 'CUS-005',
      lines: [
        ['P-HIP-S', 200, 300],
        ['P-TIL', 150, 125],
      ],
      source: 'Facebook Messenger',
      status: 'Confirmed',
      createdAt: '2026-09-25T05:05',
      trip: D1,
      eta: '08:15',
    },
    {
      no: '003',
      customerId: 'CUS-008',
      lines: [
        ['P-SUG-M', 250, 405],
        ['P-BAN', 400, 182],
      ],
      source: 'Phone',
      status: 'Confirmed',
      createdAt: '2026-09-24T17:55',
      trip: D1,
      eta: '09:30',
    },
    {
      no: '004',
      customerId: 'CUS-009',
      lines: [
        ['P-NIY', 1500, 24],
        ['P-SAB', 600, 32],
        ['P-KAM', 400, 40],
      ],
      source: 'Phone',
      status: 'Confirmed',
      createdAt: '2026-09-24T10:30',
      trip: D1,
      eta: '10:20',
    },
    // Unassigned — Navotas
    {
      no: '006',
      customerId: 'CUS-002',
      lines: [['P-SUG-L', 120, 460]],
      source: 'Phone',
      status: 'Pending Confirmation',
      createdAt: '2026-09-25T07:05',
      notes: 'On credit hold — overdue balance. Needs owner/accounting approval.',
    },
    {
      no: '007',
      customerId: 'CUS-003',
      lines: [['P-TAL', 150, 140]],
      source: 'Facebook Messenger',
      status: 'Confirmed',
      createdAt: '2026-09-25T06:40',
    },
    {
      no: '008',
      customerId: 'CUS-046',
      lines: [['P-TAH', 220, 112]],
      source: 'Facebook Messenger',
      status: 'Confirmed',
      createdAt: '2026-09-25T05:10',
    },
    // Unassigned — Valenzuela
    {
      no: '009',
      customerId: 'CUS-006',
      lines: [['P-TAH', 300, 110]],
      source: 'Facebook Messenger',
      status: 'Confirmed',
      createdAt: '2026-09-25T06:22',
    },
    {
      no: '010',
      customerId: 'CUS-007',
      lines: [['P-TAH', 150, 110]],
      source: 'Facebook Messenger',
      status: 'Confirmed',
      createdAt: '2026-09-25T06:35',
    },
    {
      no: '011',
      customerId: 'CUS-010',
      lines: [['P-BAN', 120, 185]],
      source: 'Phone',
      status: 'Confirmed',
      createdAt: '2026-09-25T07:02',
    },
    {
      no: '012',
      customerId: 'CUS-011',
      lines: [
        ['P-TAH', 100, 115],
        ['P-TIL', 60, 128],
      ],
      source: 'Customer Portal',
      status: 'Confirmed',
      createdAt: '2026-09-25T00:40',
    },
    // Unassigned — Bacoor
    {
      no: '013',
      customerId: 'CUS-022',
      lines: [
        ['P-SUG-J', 80, 520],
        ['P-TAL', 60, 170],
      ],
      fee: 2000,
      source: 'Customer Portal',
      status: 'Confirmed',
      createdAt: '2026-09-24T21:30',
      notes: 'Weekend special — sugpo for Saturday lunch service.',
    },
    {
      no: '014',
      customerId: 'CUS-024',
      lines: [['P-TAH', 190, 112]],
      source: 'Phone',
      status: 'Confirmed',
      createdAt: '2026-09-25T06:58',
    },
    // Truck 02 — South Metro
    {
      no: '015',
      customerId: 'CUS-020',
      lines: [
        ['P-SUG-L', 150, 460],
        ['P-ALI-F', 60, 660],
        ['P-TAL', 100, 145],
        ['P-PUS', 80, 285],
      ],
      fee: 1000,
      source: 'Facebook Messenger',
      status: 'Confirmed',
      createdAt: '2026-09-24T20:50',
      trip: D2,
      eta: '07:40',
    },
    {
      no: '016',
      customerId: 'CUS-019',
      lines: [
        ['P-SUG-L', 200, 455],
        ['P-ALI-F', 80, 650],
        ['P-HIP-W', 150, 335],
      ],
      source: 'Phone',
      status: 'Confirmed',
      createdAt: '2026-09-24T18:15',
      trip: D2,
      eta: '07:10',
    },
    {
      no: '017',
      customerId: 'CUS-021',
      lines: [
        ['P-TAH', 900, 110],
        ['P-BAN', 500, 182],
        ['P-TIL', 400, 124],
        ['P-NIY', 800, 24],
      ],
      source: 'Salesperson',
      status: 'Confirmed',
      createdAt: '2026-09-24T14:05',
      trip: D2,
      eta: '08:30',
    },
    {
      no: '018',
      customerId: 'CUS-023',
      lines: [
        ['P-SUG-L', 120, 500],
        ['P-TAL', 100, 170],
      ],
      fee: 1000,
      source: 'Facebook Messenger',
      status: 'Confirmed',
      createdAt: '2026-09-25T05:45',
      trip: D2,
      eta: '09:40',
    },
    // Bodega pickups
    {
      no: '019',
      customerId: 'CUS-034',
      lines: [
        ['P-ONR', 500, 108],
        ['P-GAR', 200, 128],
      ],
      source: 'Phone',
      status: 'Confirmed',
      createdAt: '2026-09-25T05:50',
    },
    {
      no: '020',
      customerId: 'CUS-040',
      lines: [
        ['P-CAR', 60, 80],
        ['P-CAB', 80, 60],
        ['P-GAR', 20, 138],
      ],
      source: 'Facebook Messenger',
      status: 'Confirmed',
      createdAt: '2026-09-24T19:45',
    },
    {
      no: '021',
      customerId: 'CUS-037',
      lines: [
        ['P-ONR', 150, 110],
        ['P-GAR', 60, 130],
        ['P-POT', 100, 80],
      ],
      source: 'Customer Portal',
      status: 'Pending Confirmation',
      createdAt: '2026-09-25T06:12',
    },
    {
      no: '022',
      customerId: 'CUS-036',
      lines: [
        ['P-ONR', 200, 108],
        ['P-TOM', 150, 60],
        ['P-CAB', 100, 58],
      ],
      source: 'Phone',
      status: 'Draft',
      createdAt: '2026-09-25T07:30',
      notes: 'Consuelo to confirm quantities by 9 AM.',
    },
  ];
  const tomorrowOrders: SimOrder[] = [];
  for (const s of tomorrowSpecs) {
    const o = scripted(TOMORROW, s);
    if (s.trip) {
      o.tripId = s.trip;
      o.history.push({ at: '2026-09-25T07:20', label: `Assigned to ${s.trip}`, by: DISPATCHER });
      const seq = deliveries.filter((d) => d.tripId === s.trip).length + 1;
      deliveries.push({
        id: o.id.replace('FR-', 'DLV-'),
        orderId: o.id,
        tripId: s.trip,
        stopSeq: seq,
        status: 'Scheduled',
        eta: at(TOMORROW, s.eta!),
      });
    }
    tomorrowOrders.push(o);
  }
  // Re-sequence Truck 02 stops by ETA (Pasay first)
  {
    const d2 = deliveries.filter((d) => d.tripId === D2).sort((a, b) => a.eta.localeCompare(b.eta));
    d2.forEach((d, i) => (d.stopSeq = i + 1));
  }

  // Upcoming standing orders and bookings (Mon Sep 28 / Tue Sep 29)
  scripted('2026-09-28', {
    no: '001',
    customerId: 'CUS-008',
    lines: [['P-SUG-L', 80, 455]],
    source: 'Repeat Order',
    status: 'Confirmed',
    createdAt: '2026-09-25T06:00',
  });
  scripted('2026-09-28', {
    no: '002',
    customerId: 'CUS-022',
    lines: [['P-SUG-J', 80, 520]],
    fee: 2000,
    source: 'Repeat Order',
    status: 'Confirmed',
    createdAt: '2026-09-25T06:00',
  });
  scripted('2026-09-28', {
    no: '003',
    customerId: 'CUS-034',
    lines: [
      ['P-ONR', 300, 108],
      ['P-GAR', 100, 128],
    ],
    source: 'Repeat Order',
    status: 'Confirmed',
    createdAt: '2026-09-25T06:00',
  });
  scripted('2026-09-29', {
    no: '001',
    customerId: 'CUS-030',
    lines: [
      ['P-BAN', 400, 180],
      ['P-TIL', 300, 122],
    ],
    source: 'Repeat Order',
    status: 'Confirmed',
    createdAt: '2026-09-25T06:00',
  });
  scripted('2026-09-29', {
    no: '002',
    customerId: 'CUS-031',
    lines: [
      ['P-SUG-L', 60, 470],
      ['P-TAL', 40, 150],
      ['P-PUS', 30, 290],
    ],
    fee: 1000,
    source: 'Facebook Messenger',
    status: 'Pending Confirmation',
    createdAt: '2026-09-25T07:41',
  });
  // The Cebu booking is numbered in today's series but ships on Monday's vessel.
  cebu021.deliveryDate = '2026-09-28';

  // ─── Today's & tomorrow's procurement ───────────────────────────────────────
  // Supplier-delivered seafood for today's loading (created yesterday, received overnight)
  buildOutboundSupplyPOs(
    TODAY,
    [
      ...t01Orders,
      ...t02Orders,
      ...orders.filter((o) => o.deliveryDate === TODAY && o.fulfillment === 'pickup'),
    ],
    { status: 'Received' },
  );
  // For tomorrow — sent this morning; the coop could only confirm part of the large sugpo volume
  const tomorrowSupply = buildOutboundSupplyPOs(
    TOMORROW,
    tomorrowOrders.filter((o) => o.status === 'Confirmed' || o.status === 'Pending Confirmation'),
    { status: 'Confirmed', shortfall: { 'P-SUG-L': 240 } },
  );
  tomorrowSupply.forEach(
    (po) =>
      (po.notes = po.items.some((i) => i.productId === 'P-SUG-L')
        ? 'Coop confirmed only part of the Large sugpo volume — harvest short due to pond draining schedule.'
        : undefined),
  );

  function scriptedPO(
    no: string,
    supplierId: string,
    items: [string, number, number][],
    extra: Partial<SimPO>,
  ): SimPO {
    const s = supplierById(supplierId);
    const po: SimPO = {
      id: `PO-260925-${no}`,
      supplierId,
      items: items.map(([productId, quantity, unitCost]) => ({ productId, quantity, unitCost })),
      status: 'Confirmed',
      createdAt: '2026-09-25T06:30',
      pickupDate: TODAY,
      pickupLocation: s.pickupLocation,
      pickupAreaId: s.pickupAreaId,
      createdBy: PROCUREMENT,
      ...extra,
    };
    purchaseOrders.push(po);
    poSeq.set(TODAY, Math.max(poSeq.get(TODAY) ?? 0, Number(no)));
    return po;
  }
  // Pad today's series so the numbered backhaul POs line up with what suppliers were told by phone.
  const fillers: [string, [string, number, number][], Partial<SimPO>][] = [
    [
      'SUP-011',
      [['P-SIL', 60, 92]],
      {
        status: 'Draft',
        pickupDate: '2026-09-26',
        deliveredBySupplier: true,
        notes: 'Waiting for Lucban harvest confirmation.',
      },
    ],
    [
      'SUP-015',
      [['P-ONR', 1000, 80]],
      {
        status: 'Cancelled',
        notes: "Cancelled — Mang Tony's stock sold out before our truck could reach Divisoria.",
      },
    ],
    [
      'SUP-013',
      [
        ['P-ONR', 1500, 82],
        ['P-GAR-N', 200, 150],
      ],
      { status: 'Draft', pickupDate: '2026-09-29', notes: "For Tuesday's Manila return leg." },
    ],
    [
      'SUP-019',
      [
        ['P-TOM', 600, 42],
        ['P-CAL', 300, 48],
      ],
      { status: 'Sent', pickupDate: '2026-09-30', notes: 'Wednesday Batangas run.' },
    ],
    [
      'SUP-022',
      [['P-GIN', 700, 84]],
      { status: 'Confirmed', pickupDate: TOMORROW, tripId: D2, pickupEta: at(TOMORROW, '12:30') },
    ],
  ];
  let fillNo = (poSeq.get(TODAY) ?? 0) + 1;
  for (const [sid, items, extra] of fillers) {
    if (fillNo > 13) break;
    scriptedPO(pad(fillNo++), sid, items, extra);
  }
  scriptedPO(
    '014',
    'SUP-012',
    [
      ['P-ONR', 1500, 85],
      ['P-GAR', 600, 90],
    ],
    {
      status: 'Ready for Pickup',
      tripId: T01,
      pickupEta: at(TODAY, '12:30'),
      createdAt: '2026-09-24T16:10',
      notes: 'Ready at Bodega 7 by 12:00 NN. Pay via bank transfer on pickup.',
    },
  );
  scriptedPO(
    '015',
    'SUP-014',
    [
      ['P-ONR', 300, 86],
      ['P-GAR', 100, 92],
      ['P-GIN', 500, 90],
    ],
    {
      status: 'Confirmed',
      tripId: T01,
      pickupEta: at(TODAY, '13:30'),
      createdAt: '2026-09-24T17:05',
    },
  );
  scriptedPO('016', 'SUP-017', [['P-ONR', 1200, 83]], {
    status: 'Confirmed',
    pickupAreaId: 'valenzuela',
    createdAt: '2026-09-25T06:45',
    notes: 'Grower drop-off at Paso de Blas, 11:00 AM. Not yet assigned to a return trip.',
  });
  scriptedPO(
    '017',
    'SUP-020',
    [
      ['P-POT', 800, 58],
      ['P-CAR', 500, 54],
      ['P-CAB', 600, 36],
      ['P-GIN', 400, 86],
    ],
    {
      status: 'Confirmed',
      tripId: T02,
      pickupEta: at(TODAY, '17:30'),
      createdAt: '2026-09-25T06:50',
    },
  );
  scriptedPO(
    '018',
    'SUP-025',
    [
      ['P-ONR', 1470, 87],
      ['P-ONW', 800, 81],
      ['P-GAR', 700, 90],
    ],
    { status: 'Sent', tripId: T02, pickupEta: at(TODAY, '16:30'), createdAt: '2026-09-25T07:05' },
  );
  // Tomorrow's Navotas/Valenzuela return
  scriptedPO(
    '019',
    'SUP-012',
    [
      ['P-ONR', 1200, 85],
      ['P-GIN', 400, 92],
    ],
    {
      status: 'Sent',
      pickupDate: TOMORROW,
      tripId: D1,
      pickupEta: at(TOMORROW, '12:30'),
      createdAt: '2026-09-25T07:25',
    },
  );

  // ─── Payments ───────────────────────────────────────────────────────────────
  const maskRef = (method: SalesPaymentMethod) => {
    const tail = pad(rint(0, 9999), 4);
    switch (method) {
      case 'GCash':
        return `GCash Ref •••• ${tail}`;
      case 'Maya':
        return `Maya Ref •••• ${tail}`;
      case 'Bank Transfer':
        return `Bank Ref •••• ${tail}`;
      case 'Check':
        return `Check No. •••${tail.slice(1)}`;
      case 'COD':
        return 'Cash collected by driver';
      case 'Credit Settlement':
        return `Settlement •••• ${tail}`;
      default:
        return `Cash — OR copy on file`;
    }
  };
  function pay(
    o: SimOrder,
    amount: number,
    date: string,
    method: SalesPaymentMethod,
    notes?: string,
  ) {
    if (date > NOW || amount <= 0) return;
    rawPayments.push({
      customerId: o.customerId,
      invoiceId: invoiceIdForOrder(o.id),
      orderId: o.id,
      amount: Math.round(amount),
      method,
      reference: maskRef(method),
      date,
      recordedBy: ACCOUNTING,
      notes,
    });
  }

  for (const { o, paid, paidOn } of openingOrders)
    if (paid && paidOn)
      pay(
        o,
        paid,
        at(paidOn, '10:30'),
        'Credit Settlement',
        'Partial settlement of opening balance',
      );
  for (const o of orders) {
    if (o.notes === GO_LIVE_NOTE) continue;
    if (!(
      o.status === 'Delivered' ||
      o.status === 'Partially Delivered' ||
      (o.fulfillment === 'partner' && o.status === 'Out for Delivery')
    ))
      continue;
    const c = customerById(o.customerId)!;
    const total = orderBilledAmount(o);
    const issue = (o.deliveredAt ?? o.deliveryDate).slice(0, 10);
    const due = addDaysISO(issue, termsDays(o.paymentTerms));
    const trip = trips.find((t) => t.id === o.tripId);
    const collector = trip ? driverById(trip.driverId).name : undefined;

    if (o.paymentTerms === 'COD') {
      const when = o.deliveredAt ?? at(issue, '10:00');
      const method: SalesPaymentMethod =
        o.fulfillment === 'pickup'
          ? chance(0.8)
            ? 'Cash'
            : 'GCash'
          : chance(0.55)
            ? 'COD'
            : chance(0.78)
              ? 'GCash'
              : 'Maya';
      if (c.paymentBehavior === 'average' && chance(0.15)) {
        const first = Math.round((total * 0.7) / 100) * 100;
        pay(
          o,
          first,
          when,
          method,
          collector && method === 'COD' ? `Partial — remitted by ${collector}` : 'Partial payment',
        );
        pay(
          o,
          total - first,
          at(addDaysISO(issue, rint(2, 6)), '09:15'),
          'GCash',
          'Balance settled on next delivery',
        );
      } else {
        pay(
          o,
          total,
          when,
          method,
          collector && method === 'COD' ? `Remitted by ${collector}` : undefined,
        );
      }
    } else if (o.paymentTerms === '50% Down, Balance on Arrival') {
      const dp = Math.round(total / 2);
      pay(o, dp, plusMin(o.createdAt, rint(60, 240)), 'Bank Transfer', '50% down payment');
      if (o.status === 'Delivered')
        pay(o, total - dp, at(due, '11:00'), 'Bank Transfer', 'Balance on arrival');
    } else if (isCreditTerms(o.paymentTerms)) {
      const offset = {
        prompt: rint(-3, 1),
        average: rint(-1, 7),
        slow: rint(4, 20),
        delinquent: rint(14, 48),
      }[c.paymentBehavior];
      let payDate = addDaysISO(due, offset);
      if (payDate <= issue) payDate = addDaysISO(issue, 1);
      const method: SalesPaymentMethod = chance(0.55)
        ? 'Bank Transfer'
        : chance(0.6)
          ? 'Check'
          : 'GCash';
      const when = at(payDate, `${pad(rint(9, 16), 2)}:${pad(rint(0, 59), 2)}`);
      if (c.paymentBehavior === 'delinquent' && chance(0.5)) {
        pay(
          o,
          Math.round((total * 0.5) / 1000) * 1000,
          when,
          'Credit Settlement',
          'Partial settlement — balance promised next week',
        );
      } else {
        pay(o, total, when, method);
      }
    }
  }
  rawPayments.sort((a, b) => a.date.localeCompare(b.date));
  const paySeq = new Map<string, number>();
  const payments: SalesPayment[] = rawPayments.map((p, i) => {
    const day = p.date.slice(0, 10);
    const n = (paySeq.get(day) ?? 0) + 1;
    paySeq.set(day, n);
    return { ...p, id: `SP-${yymmdd(day)}-${pad(n)}`, receiptNo: `SR-${pad(4100 + i, 6)}` };
  });

  // ─── Final sort ─────────────────────────────────────────────────────────────
  orders.sort((a, b) => b.id.localeCompare(a.id));
  purchaseOrders.sort((a, b) => b.id.localeCompare(a.id));

  // ─── Inventory (current state at 07:48) ─────────────────────────────────────
  const inventory: InventoryBatch[] = [];
  {
    let n = 0;
    const batchId = (p: Product, date: string) =>
      `BATCH-${p.category === 'seafood' ? 'SF' : 'AG'}-${yymmdd(date)}-${pad(++n)}`;
    // Today's supplier deliveries: remaining at the bodega after Truck 01 loaded out.
    const loadedT01 = new Map<string, number>();
    for (const o of t01Orders)
      for (const i of o.items)
        loadedT01.set(i.productId, (loadedT01.get(i.productId) ?? 0) + i.quantity);
    for (const po of purchaseOrders.filter(
      (p) => p.pickupDate === TODAY && p.deliveredBySupplier && p.status === 'Received',
    )) {
      for (const it of po.items) {
        const p = productById(it.productId);
        const take = Math.min(it.quantity, loadedT01.get(it.productId) ?? 0);
        loadedT01.set(it.productId, (loadedT01.get(it.productId) ?? 0) - take);
        const remaining = it.quantity - take;
        if (remaining <= 0) continue;
        inventory.push({
          id: batchId(p, TODAY),
          productId: p.id,
          location: 'Lucena Main Warehouse',
          source: `${supplierById(po.supplierId).name}`,
          supplierId: po.supplierId,
          poId: po.id,
          receivedAt: po.receivedAt!,
          onHand: remaining,
          damaged: p.id === 'P-TAL' ? 12 : 0,
          unitCost: it.unitCost,
          note: p.id === 'P-TAL' ? '12 kg mortality found on sorting' : undefined,
        });
      }
    }
    // Backhaul produce from recent return trips, partly sold through bodega pickups (FIFO).
    const remainingShare = (ageDays: number) =>
      ageDays <= 1 ? 0.62 : ageDays === 2 ? 0.3 : ageDays === 3 ? 0.14 : 0.06;
    const recent = purchaseOrders.filter(
      (p) =>
        p.tripId &&
        (p.status === 'Received' || p.status === 'Partially Received') &&
        p.pickupDate >= addDaysISO(TODAY, -5),
    );
    for (const po of recent) {
      const age = Math.round(
        (parseISO(TODAY).getTime() - parseISO(po.pickupDate).getTime()) / 86400000,
      );
      for (const it of po.items) {
        const p = productById(it.productId);
        const onHand = roundTo((it.receivedQty ?? it.quantity) * remainingShare(age), 10);
        if (onHand < 20) continue;
        const damaged =
          p.id === 'P-TOM'
            ? Math.round(onHand * 0.04)
            : p.id === 'P-CAB'
              ? Math.round(onHand * 0.02)
              : 0;
        inventory.push({
          id: batchId(p, po.pickupDate),
          productId: p.id,
          location: 'Lucena Main Warehouse',
          source: `${supplierById(po.supplierId).name} (${areaById(po.pickupAreaId).name})`,
          supplierId: po.supplierId,
          poId: po.id,
          receivedAt: po.receivedAt!,
          onHand,
          damaged,
          unitCost: it.unitCost,
          note: damaged ? 'Bruised units set aside for markdown' : undefined,
        });
      }
    }
    // Staged at a partner bodega in Divisoria, waiting for Tuesday's Manila return leg.
    inventory.push({
      id: batchId(productById('P-GAR-N'), '2026-09-22'),
      productId: 'P-GAR-N',
      location: 'Temporary Manila Pickup',
      source: 'Ilocos Garlic Traders — held at Bodega ni Mang Tony, Divisoria',
      supplierId: 'SUP-018',
      receivedAt: '2026-09-22T13:20',
      onHand: 250,
      damaged: 0,
      unitCost: 146,
      note: 'Paid; to be collected on the Sep 29 Manila return leg.',
    });
  }

  // ─── Customer lifetime baselines (sales before the 30-day data window) ──────
  const windowSales = new Map<string, number>();
  for (const o of orders)
    if (o.status === 'Delivered' || o.status === 'Partially Delivered')
      windowSales.set(o.customerId, (windowSales.get(o.customerId) ?? 0) + orderBilledAmount(o));
  const LIFETIME_BASELINE: Record<string, number> = {};
  for (const c of CUSTOMERS) {
    const months = Math.max(
      0,
      (parseISO(START).getTime() - parseISO(c.customerSince).getTime()) / (30 * 86400000),
    );
    LIFETIME_BASELINE[c.id] =
      Math.round(((windowSales.get(c.id) ?? 0) * months * rfloat(0.62, 0.9)) / 1000) * 1000;
  }

  // ─── Quote requests (RFQs) ──────────────────────────────────────────────────
  const quoteRequests: QuoteRequest[] = [
    {
      id: 'RFQ-0418',
      businessName: 'Seaside Grill Bacoor',
      contactName: 'Marco Villareal',
      phone: '0917 921 4406',
      businessType: 'Restaurant',
      productId: 'P-SUG-J',
      quantity: 150,
      unit: 'kg',
      frequency: 'One-time (Oct 10 anniversary event)',
      deliveryArea: 'Bacoor, Cavite',
      preferredDate: '2026-10-09',
      status: 'Quoted',
      quotedPrice: 495,
      createdAt: '2026-09-21T14:20',
      customerId: 'CUS-022',
    },
    {
      id: 'RFQ-0421',
      businessName: 'Seaside Grill Bacoor',
      contactName: 'Marco Villareal',
      phone: '0917 921 4406',
      businessType: 'Restaurant',
      productId: 'P-TAL-S',
      quantity: 20,
      unit: 'kg/week',
      frequency: 'Weekly',
      deliveryArea: 'Bacoor, Cavite',
      preferredDate: '2026-10-01',
      status: 'Under Review',
      createdAt: '2026-09-24T10:05',
      customerId: 'CUS-022',
    },
    {
      id: 'RFQ-0419',
      businessName: 'Sariaya Beach Resort',
      contactName: 'Victor Paredes',
      phone: '0917 206 8834',
      businessType: 'Resort',
      productId: 'P-SUG-J',
      quantity: 60,
      unit: 'kg/week',
      frequency: 'Weekly (Oct–Dec)',
      deliveryArea: 'Sariaya, Quezon',
      preferredDate: '2026-10-03',
      status: 'Quoted',
      quotedPrice: 505,
      createdAt: '2026-09-18T09:30',
    },
    {
      id: 'RFQ-0420',
      businessName: 'Lipa Grand Events Pavilion',
      contactName: 'Ronaldo Katigbak',
      phone: '0918 772 9016',
      businessType: 'Catering Company',
      productId: 'P-ALI-F',
      quantity: 40,
      unit: 'kg per event',
      frequency: '2–3 events/month',
      deliveryArea: 'Lipa City, Batangas',
      preferredDate: '2026-10-02',
      status: 'Submitted',
      createdAt: '2026-09-23T16:45',
    },
    {
      id: 'RFQ-0422',
      businessName: 'Navotas Bangkero Seafood Stall',
      contactName: 'Rommel Tuazon',
      phone: '0947 205 1180',
      businessType: 'Palengke Vendor',
      productId: 'P-TAH',
      quantity: 120,
      unit: 'kg/week',
      frequency: '2 deliveries/week',
      deliveryArea: 'Navotas City',
      preferredDate: '2026-09-30',
      status: 'Submitted',
      createdAt: '2026-09-25T05:55',
    },
    {
      id: 'RFQ-0417',
      businessName: 'Makati Hotel Group Purchasing',
      contactName: 'Andrea Lim',
      phone: '0917 802 1156',
      businessType: 'Hotel',
      productId: 'P-SUG-J',
      quantity: 500,
      unit: 'kg/week',
      frequency: '3 deliveries/week',
      deliveryArea: 'Makati City',
      preferredDate: '2026-10-05',
      status: 'Under Review',
      createdAt: '2026-09-17T11:10',
    },
  ];

  // ─── Export: strip the simulated truck runs from product records ────────────
  const TRIP_EVENT = /TRIP-|^Loaded to Truck|^Loading started/;
  function toOrder(o: SimOrder): Order {
    const { tripId, ...rest } = o;
    void tripId;
    return { ...rest, history: rest.history.filter((e) => !TRIP_EVENT.test(e.label)) };
  }
  function toPO(p: SimPO): PurchaseOrder {
    const { tripId, ...rest } = p;
    void tripId;
    return rest;
  }

  return {
    orders: orders.map(toOrder),
    purchaseOrders: purchaseOrders.map(toPO),
    salesPayments: payments,
    inventory,
    quoteRequests,
    lifetimeBaseline: LIFETIME_BASELINE,
  };
}

export type TradingSeed = ReturnType<typeof generateTradingSeed>;
