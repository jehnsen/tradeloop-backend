/**
 * TradeLoop operations commands. Each command reads the organization's data set and returns a
 * new one (records are never mutated in place, so the change set is a diff by identity).
 *
 * These are the workflows the screens trigger: quote → job → loads → trip → delivery & POD →
 * invoice → payment, plus fleet records, the Load Board and the Backhaul Marketplace. Derived
 * values (invoices, trip metrics, board statuses) come from the shared domain library.
 */
import { areaById, LUCENA_WAREHOUSE, ROUTES, routeById } from '../domain/data/areas';
import { STAFF, TODAY, staffById } from '../domain/data/company';
import { DRIVERS, TRUCKS, driverById, truckById } from '../domain/data/fleet';
import { PRODUCTS } from '../domain/data/products';
import { SUPPLIERS, supplierById } from '../domain/data/suppliers';
import { listingStatus, marketplaceQuote } from '../domain/lib/backhaul-marketplace';
import {
  bookingLeg,
  customerTypeFor,
  leadSourceFor,
  legOpen,
  requiredByFor,
  shortArea,
  truckRequirementFor,
} from '../domain/lib/load-board';
import {
  DELIVERY_DONE,
  canAddReturnCargo,
  currentOdometer,
  getInvoices,
  getTripMetricsMap,
  invoiceIdForJob,
  isBillableJob,
  isTripEditable,
  jobTotal,
  nextSeqId,
  rebuildTrip,
} from '../domain/lib/logistics';
import type {
  AppNotification,
  AvailableCapacity,
  AvailableLoadStatus,
  BackhaulListing,
  BackhaulBookingRequest,
  BookBoardLoadInput,
  BookingResult,
  CapacityStatus,
  CargoCategory,
  ConfirmBackhaulRequestInput,
  Customer,
  DeliveryIssueInput,
  DocumentRenewalInput,
  FreightQuote,
  FuelLog,
  JobStatus,
  Lead,
  LeadSource,
  LeadStage,
  Load,
  LoadType,
  LogisticsJob,
  MaintenanceStatus,
  MaintenanceUpdateInput,
  ManualTripStatus,
  NewBackhaulRequestInput,
  NewBoardLoadInput,
  NewCapacityInput,
  NewCompanyLoadInput,
  NewCustomerInput,
  NewExpenseInput,
  NewFuelLogInput,
  NewJobInput,
  NewLeadInput,
  NewMaintenanceInput,
  NewOrderInput,
  NewPartnerInput,
  NewPaymentInput,
  NewPOInput,
  NewQuoteInput,
  NewQuoteRequestInput,
  NewSalesPaymentInput,
  NewTripInput,
  OpsData,
  Order,
  OrderEditInput,
  OrderStatus,
  Payment,
  PaymentTerms,
  Place,
  PodInput,
  POStatus,
  ProofOfDelivery,
  PublishListingInput,
  QuoteStatus,
  Role,
  SalesPayment,
  StandingOrder,
  StandingOrderInput,
  Trip,
  TripCloseInput,
  TripStatus,
} from '../domain/types';
import { notFoundError, ruleError } from './errors';

/** Who is acting and the operations clock. */
export interface CommandEnv {
  /** Name recorded in history entries ("by"). */
  actor: string;
  /** App role of the caller. */
  role: Role;
  /** Advances the operations clock and returns the new time ("YYYY-MM-DDTHH:mm"). */
  stamp(): string;
  /** Unique id for a new notification. */
  notificationId(): string;
}

/** Holds the data set while a command runs (same get/set shape as the app store). */
export interface DataBox {
  get(): OpsData;
  set(patch: Partial<OpsData> | ((s: OpsData) => Partial<OpsData>)): void;
}

const yymmdd = (iso: string) => iso.slice(2, 10).replace(/-/g, '');
const maxNum = (ids: string[], re: RegExp) =>
  ids.reduce((m, id) => Math.max(m, Number(id.match(re)?.[1] ?? 0)), 0);

/** Trip statuses a dispatcher may set directly, and the statuses each may follow. */
const MANUAL_TRIP_TRANSITIONS: Record<ManualTripStatus, TripStatus[]> = {
  Loading: ['Planned'],
  Ready: ['Planned', 'Loading'],
  Dispatched: ['Planned', 'Loading', 'Ready'],
  Cancelled: ['Planned', 'Loading', 'Ready'],
};
const PRE_DISPATCH_JOB: JobStatus[] = ['Inquiry', 'Quoted', 'Confirmed', 'Awaiting Dispatch'];
const CLOSED_JOB: JobStatus[] = ['Delivered', 'Completed', 'Cancelled'];

function need<T extends { id: string }>(rows: T[], id: string, what: string): T {
  const row = rows.find((r) => r.id === id);
  if (!row) throw notFoundError(what, id);
  return row;
}

export function createCommands(box: DataBox, env: CommandEnv) {
  const { get, set } = box;
  const stamp = env.stamp;
  const actor = () => env.actor;
  const notify = (n: Omit<AppNotification, 'id' | 'at' | 'read'>) =>
    set((s) => ({
      notifications: [
        { ...n, id: env.notificationId(), at: stamp(), read: false },
        ...s.notifications,
      ].slice(0, 200),
    }));
  const jobEvent = (
    j: LogisticsJob,
    label: string,
    at: string,
    note?: string,
    by?: string,
  ): LogisticsJob => ({ ...j, history: [...j.history, { at, label, by: by ?? actor(), note }] });
  const tripEvent = (t: Trip, label: string, at: string, note?: string, by?: string): Trip => ({
    ...t,
    history: [...t.history, { at, label, by: by ?? actor(), note }],
  });

  /** Re-plan the given trips after loads/jobs changed, keeping deliveries consistent. */
  const replan = (tripIds: (string | undefined | null)[], loads: Load[], jobs: LogisticsJob[]) => {
    const s = get();
    let trips = s.trips;
    let deliveries = s.deliveries;
    for (const id of new Set(tripIds.filter((x): x is string => !!x))) {
      const trip = trips.find((t) => t.id === id);
      if (!trip) continue;
      const r = rebuildTrip(trip, loads, jobs, s.customers, deliveries);
      trips = trips.map((t) => (t.id === id ? r.trip : t));
      deliveries = r.deliveries;
    }
    return { trips, deliveries };
  };

  const newLoadIds = (date: string, n: number, existing: Load[]) => {
    const head = `LOAD-${yymmdd(date)}-`;
    const start = existing
      .filter((l) => l.id.startsWith(head))
      .reduce((m, l) => Math.max(m, Number(l.id.slice(head.length)) || 0), 0);
    return Array.from({ length: n }, (_, i) => `${head}${String(start + i + 1).padStart(3, '0')}`);
  };

  const buildJob = (input: NewJobInput, at: string): { job: LogisticsJob; loads: Load[] } => {
    const s = get();
    const customer = need(s.customers, input.customerId, 'Customer');
    const date = input.pickupAt.slice(0, 10);
    const id = nextSeqId('JOB', yymmdd(date), s.jobs);
    const weightKg = input.cargo.reduce((a, l) => a + l.weightKg, 0);
    const heaviest = [...input.cargo].sort((a, b) => b.weightKg - a.weightKg)[0];
    const job: LogisticsJob = {
      id,
      customerId: customer.id,
      source: input.source,
      quoteId: input.quoteId,
      leg: input.leg,
      pickup: input.pickup,
      dropoff: input.dropoff,
      consignee: input.consignee,
      cargoDescription: input.cargo.map((l) => l.cargoDescription).join(' + '),
      cargoCategory: heaviest?.cargoCategory ?? 'General Cargo',
      weightKg,
      truckRequirement: input.truckRequirement,
      pickupAt: input.pickupAt,
      requiredBy: input.requiredBy,
      freightCharge: input.freightCharge,
      additionalCharges: input.additionalCharges,
      paymentTerms: input.paymentTerms,
      status: input.status,
      salespersonId: customer.salespersonId,
      instructions: input.instructions,
      notes: input.notes,
      createdAt: at,
      history: [
        {
          at,
          label:
            input.source === 'Customer Portal'
              ? 'Booking submitted via Customer Portal'
              : `Booking recorded (${input.source})`,
          by: actor(),
        },
        ...(input.status !== 'Inquiry' ? [{ at, label: 'Booking confirmed', by: actor() }] : []),
      ],
    };
    const type: LoadType = input.loadType ?? (input.leg === 'outbound' ? 'Outbound' : 'Backhaul');
    const ids = newLoadIds(date, input.cargo.length, s.loads);
    const loads: Load[] = input.cargo.map((l, i) => ({
      id: ids[i],
      jobId: id,
      customerId: customer.id,
      type,
      leg: input.leg,
      cargoDescription: l.cargoDescription,
      cargoCategory: l.cargoCategory,
      quantity: l.quantity,
      unit: l.unit,
      weightKg: l.weightKg,
      pickup: input.pickup,
      destination: input.dropoff,
      status: 'Pending',
      handlingNotes: l.handlingNotes,
      createdAt: at,
    }));
    return { job, loads };
  };

  /** Save an outside shipper as a new customer — COD until credit review. */
  const addShipperCustomer = (o: {
    name: string;
    contact: { name: string; phone: string };
    place: Place;
    addressLabel: string;
    category: CargoCategory;
    paymentTerms: PaymentTerms;
    leadSource: LeadSource;
    notes: string;
  }) => {
    const s = get();
    const id = `CUS-${String(
      maxNum(
        s.customers.map((c) => c.id),
        /CUS-(\d+)/,
      ) + 1,
    ).padStart(3, '0')}`;
    const area = areaById(o.place.areaId);
    const customer: Customer = {
      id,
      name: o.name,
      type: customerTypeFor(o.category),
      areaId: area.id,
      contacts: [
        { name: o.contact.name, position: 'Shipper', phone: o.contact.phone, primary: true },
      ],
      addresses: [
        {
          id: `${id}-A1`,
          label: o.addressLabel,
          line1: o.place.address ?? o.place.name,
          barangay: '—',
          city: area.name,
          province: area.province,
          areaId: area.id,
          receivingHours: 'To be confirmed',
          default: true,
        },
      ],
      paymentTerms: o.paymentTerms,
      creditLimit: 0,
      salespersonId: 'ST-02',
      leadSource: o.leadSource,
      customerSince: TODAY,
      preferredProductIds: [],
      fulfillment: 'truck',
      status: 'new',
      notes: o.notes,
      deliveryFee: 0,
      paymentBehavior: 'average',
      frequency: 2,
    };
    set({ customers: [...s.customers, customer] });
    return id;
  };

  /** Return-leg space left on our trip: configured payload − return kg. */
  const returnSpace = (tripId: string) => {
    const s = get();
    const m = getTripMetricsMap(s.trips, s.jobs, s.loads, s.deliveries, s.expenses).get(tripId);
    return m ? m.capacityKg - m.returnKg : 0;
  };

  /** Put a job's open loads on a trip (or take them off). False when the trip leg is closed. */
  const assignJob = (jobId: string, tripId: string | null): boolean => {
    const at = stamp();
    const s = get();
    const job = need(s.jobs, jobId, 'Job');
    const trip = tripId ? need(s.trips, tripId, 'Trip') : undefined;
    if (trip && !(job.leg === 'return' ? canAddReturnCargo(trip) : isTripEditable(trip)))
      return false;
    const prevTrips = s.loads.filter((l) => l.jobId === jobId && l.tripId).map((l) => l.tripId);
    const loads = s.loads.map((l) =>
      l.jobId === jobId && l.status !== 'Cancelled' && l.status !== 'Delivered'
        ? {
            ...l,
            tripId: tripId ?? undefined,
            status: tripId ? ('Assigned' as const) : ('Pending' as const),
          }
        : l,
    );
    const jobs = s.jobs.map((j) =>
      j.id === jobId
        ? jobEvent(
            {
              ...j,
              tripId: tripId ?? undefined,
              status: tripId ? 'Assigned' : 'Awaiting Dispatch',
            },
            tripId ? `Assigned to ${tripId}` : `Removed from ${job.tripId}`,
            at,
            trip
              ? `${truckById(trip.truckId).code} · ${driverById(trip.driverId).name}`
              : undefined,
          )
        : j,
    );
    set({ loads, jobs });
    set(replan([...prevTrips, tripId], loads, jobs));
    return true;
  };

  /** Record a freight payment against a job's invoice. Returns the official receipt number. */
  const pay = (input: NewPaymentInput) => {
    const s = get();
    const date = stamp();
    const id = nextSeqId('PAY', yymmdd(date), s.payments);
    const receiptNo = `OR-${String(
      maxNum(
        s.payments.map((p) => p.receiptNo),
        /OR-(\d+)/,
      ) + 1,
    ).padStart(6, '0')}`;
    // Cash a driver collects is booked by accounting.
    const recordedBy =
      env.role === 'driver'
        ? (STAFF.find((m) => m.role === 'accounting')?.name ?? actor())
        : actor();
    const payment: Payment = { ...input, id, receiptNo, date, recordedBy };
    set((st) => ({
      payments: [...st.payments, payment],
      jobs: st.jobs.map((j) =>
        j.id === input.jobId
          ? jobEvent(
              j,
              `Payment received — ₱${input.amount.toLocaleString('en-PH')}`,
              date,
              `${input.method} · ${receiptNo}`,
              recordedBy,
            )
          : j,
      ),
    }));
    return receiptNo;
  };

  const addExpense = (e: NewExpenseInput) => {
    const id = `EXP-${String(
      maxNum(
        get().expenses.map((x) => x.id),
        /EXP-(\d+)/,
      ) + 1,
    ).padStart(5, '0')}`;
    set((s) => ({ expenses: [{ ...e, id, recordedBy: actor() }, ...s.expenses] }));
    return id;
  };

  const addFuelLog = (input: NewFuelLogInput) => {
    const s = get();
    const id = `FUEL-${String(
      maxNum(
        s.fuelLogs.map((f) => f.id),
        /FUEL-(\d+)/,
      ) + 1,
    ).padStart(4, '0')}`;
    const log: FuelLog = {
      ...input,
      id,
      totalCost: Math.round(input.liters * input.pricePerLiter),
    };
    set({ fuelLogs: [log, ...s.fuelLogs] });
    addExpense({
      date: input.date.slice(0, 10),
      category: 'Diesel',
      amount: log.totalCost,
      description: `${input.liters} L diesel @ ₱${input.pricePerLiter.toFixed(2)}/L${input.fullTank ? ' (full tank)' : ' (top-up)'}`,
      tripId: input.tripId,
      truckId: input.truckId,
      driverId: input.driverId,
      fuelLogId: id,
      paidTo: input.station,
      receiptRef: input.receiptRef,
    });
    return id;
  };

  const convertLead = (id: string) => {
    const s = get();
    const lead = need(s.leads, id, 'Lead');
    if (lead.convertedCustomerId) return lead.convertedCustomerId;
    const cid = `CUS-${String(
      maxNum(
        s.customers.map((c) => c.id),
        /CUS-(\d+)/,
      ) + 1,
    ).padStart(3, '0')}`;
    const areaId = lead.areaId ?? 'lucena';
    const area = areaById(areaId);
    const customer: Customer = {
      id: cid,
      name: lead.businessName,
      type: lead.businessType,
      areaId,
      contacts: [{ name: lead.contactName, position: 'Owner', phone: lead.phone, primary: true }],
      addresses: [
        {
          id: `${cid}-A1`,
          label: 'Main address',
          line1: 'To be confirmed on first booking',
          barangay: '—',
          city: area.name,
          province: area.province,
          areaId,
          receivingHours: '6:00 AM – 12:00 NN',
          default: true,
        },
      ],
      paymentTerms: 'COD',
      creditLimit: 0,
      salespersonId: staffById(lead.ownerId) ? lead.ownerId : 'ST-02',
      leadSource: lead.source,
      customerSince: TODAY,
      preferredProductIds: [],
      fulfillment: area.interIsland ? 'partner' : 'truck',
      status: 'new',
      notes: `Converted from lead ${lead.id} (${lead.source}). Lane: ${lead.lane}. Cargo: ${lead.cargoInterest}. Potential: ${lead.potentialVolume}. First 3 bookings COD before credit review.`,
      deliveryFee: 0,
      paymentBehavior: 'average',
      frequency: 3,
    };
    const at = stamp();
    set({
      customers: [...s.customers, customer],
      leads: s.leads.map((l) =>
        l.id === id
          ? {
              ...l,
              stage: 'Won',
              convertedCustomerId: cid,
              activities: [
                ...l.activities,
                { at, note: `Converted to customer ${cid}`, by: actor() },
              ],
            }
          : l,
      ),
      quotes: s.quotes.map((q) =>
        q.leadId === id && !q.customerId ? { ...q, customerId: cid } : q,
      ),
    });
    return cid;
  };

  const assignJobToTrip = (jobId: string, tripId: string | null) => {
    const job = need(get().jobs, jobId, 'Job');
    if (CLOSED_JOB.includes(job.status) || job.status === 'In Transit')
      throw ruleError('JOB_NOT_ASSIGNABLE', `${jobId} is ${job.status} and cannot change trips`);
    if (!assignJob(jobId, tripId))
      throw ruleError(
        'TRIP_NOT_EDITABLE',
        job.leg === 'return'
          ? `${tripId} can no longer take return cargo`
          : `${tripId} has left Lucena; outbound cargo can no longer be added`,
      );
  };

  return {
    // ─── Sales & CRM ──────────────────────────────────────────────────
    createQuote(input: NewQuoteInput) {
      const s = get();
      if (input.customerId) need(s.customers, input.customerId, 'Customer');
      if (input.leadId) need(s.leads, input.leadId, 'Lead');
      const at = stamp();
      const id = nextSeqId('QT', yymmdd(at), s.quotes);
      const q: FreightQuote = {
        ...input,
        id,
        createdAt: at,
        createdBy: actor(),
        sentAt: input.status === 'Sent' ? at : undefined,
      };
      set((st) => ({ quotes: [q, ...st.quotes] }));
      return id;
    },

    setQuoteStatus(id: string, status: QuoteStatus, reason?: string) {
      need(get().quotes, id, 'Quote');
      const at = stamp();
      set((s) => ({
        quotes: s.quotes.map((q) =>
          q.id === id
            ? {
                ...q,
                status,
                sentAt: status === 'Sent' ? at : q.sentAt,
                respondedAt: status === 'Accepted' || status === 'Rejected' ? at : q.respondedAt,
                rejectReason: status === 'Rejected' ? reason : q.rejectReason,
              }
            : q,
        ),
      }));
    },

    convertQuoteToJob(quoteId: string) {
      const q = need(get().quotes, quoteId, 'Quote');
      if (q.jobId) return q.jobId;
      let customerId = q.customerId;
      if (!customerId && q.leadId) customerId = convertLead(q.leadId);
      if (!customerId)
        throw ruleError('QUOTE_HAS_NO_CUSTOMER', `${quoteId} has no customer or lead to bill`);
      const customer = need(get().customers, customerId, 'Customer');
      const contact = customer.contacts[0] ?? { name: customer.name, phone: '' };
      const at = stamp();
      const leg = areaById(q.pickup.areaId).region === 'Quezon Province' ? 'outbound' : 'return';
      const { job, loads } = buildJob(
        {
          customerId: customer.id,
          source: 'Sales Staff',
          leg,
          pickup: q.pickup,
          dropoff: q.dropoff,
          consignee: { name: contact.name, phone: contact.phone },
          cargo: [
            {
              cargoDescription: q.cargoDescription,
              cargoCategory: q.cargoCategory,
              quantity: Math.max(1, Math.round(q.weightKg / 25)),
              unit: 'package',
              weightKg: q.weightKg,
            },
          ],
          truckRequirement: q.truckRequirement,
          pickupAt: `${q.pickupDate < TODAY ? TODAY : q.pickupDate}T04:00`,
          requiredBy: `${q.requiredDate < TODAY ? TODAY : q.requiredDate}T14:00`,
          freightCharge: q.freightCharge,
          additionalCharges: q.additionalCharges,
          paymentTerms: customer.paymentTerms,
          notes: q.notes,
          status: 'Confirmed',
          quoteId,
        },
        at,
      );
      const withEvent = jobEvent(job, `Created from accepted quote ${quoteId}`, at);
      set((s) => ({
        jobs: [withEvent, ...s.jobs],
        loads: [...loads, ...s.loads],
        quotes: s.quotes.map((x) =>
          x.id === quoteId
            ? {
                ...x,
                jobId: job.id,
                status: 'Accepted',
                customerId: customer.id,
                respondedAt: x.respondedAt ?? at,
              }
            : x,
        ),
      }));
      return job.id;
    },

    moveLead(id: string, stage: LeadStage, note?: string) {
      need(get().leads, id, 'Lead');
      const at = stamp();
      set((s) => ({
        leads: s.leads.map((l) =>
          l.id === id
            ? {
                ...l,
                stage,
                lastContactAt: at.slice(0, 10),
                activities: [
                  ...l.activities,
                  { at, note: note ?? `Moved to ${stage}`, by: actor() },
                ],
              }
            : l,
        ),
      }));
    },

    addLead(lead: NewLeadInput) {
      const s = get();
      const id = `LD-${String(
        maxNum(
          s.leads.map((l) => l.id),
          /LD-(\d+)/,
        ) + 1,
      ).padStart(3, '0')}`;
      const at = stamp();
      const record: Lead = {
        ...lead,
        id,
        createdAt: at.slice(0, 10),
        lastContactAt: at.slice(0, 10),
        activities: [{ at, note: 'Lead created', by: actor() }],
      };
      set({ leads: [record, ...s.leads] });
      return id;
    },

    convertLead,

    addCustomer(input: NewCustomerInput) {
      const s = get();
      const id = `CUS-${String(
        maxNum(
          s.customers.map((c) => c.id),
          /CUS-(\d+)/,
        ) + 1,
      ).padStart(3, '0')}`;
      const customer: Customer = {
        ...input,
        id,
        customerSince: TODAY,
        status: 'new',
        paymentBehavior: 'average',
        frequency: 3,
        addresses: input.addresses.map((a, i) => ({ ...a, id: `${id}-A${i + 1}` })),
      };
      set({ customers: [...s.customers, customer] });
      return id;
    },

    // ─── Jobs & cargo ─────────────────────────────────────────────────
    createJob(input: NewJobInput) {
      if (input.quoteId) need(get().quotes, input.quoteId, 'Quote');
      const at = stamp();
      const { job, loads } = buildJob(input, at);
      set((s) => ({ jobs: [job, ...s.jobs], loads: [...loads, ...s.loads] }));
      if (input.quoteId)
        set((s) => ({
          quotes: s.quotes.map((q) => (q.id === input.quoteId ? { ...q, jobId: job.id } : q)),
        }));
      if (input.status !== 'Inquiry') {
        const c = need(get().customers, input.customerId, 'Customer');
        notify({
          kind: 'job',
          title: 'New job awaiting dispatch',
          body: `${job.id} — ${c.name}, ${job.weightKg.toLocaleString('en-PH')} kg ${job.cargoDescription}.`,
          href: `/jobs/${job.id}`,
          severity: 'info',
          roles: ['owner', 'dispatcher'],
        });
      }
      return job.id;
    },

    setJobStatus(id: string, status: JobStatus, note?: string) {
      const job = need(get().jobs, id, 'Job');
      if (!PRE_DISPATCH_JOB.includes(job.status))
        throw ruleError(
          'JOB_DISPATCHED',
          `${id} is ${job.status}; its status follows the trip now`,
        );
      const at = stamp();
      set((s) => ({
        jobs: s.jobs.map((j) =>
          j.id === id
            ? jobEvent(
                { ...j, status },
                status === 'Confirmed' ? 'Booking confirmed' : `Status changed to ${status}`,
                at,
                note,
              )
            : j,
        ),
      }));
    },

    cancelJob(id: string, reason: string) {
      const job = need(get().jobs, id, 'Job');
      if (CLOSED_JOB.includes(job.status))
        throw ruleError('JOB_CLOSED', `${id} is already ${job.status}`);
      const at = stamp();
      const s = get();
      const loads = s.loads.map((l) =>
        l.jobId === id && l.status !== 'Delivered'
          ? { ...l, status: 'Cancelled' as const, tripId: undefined }
          : l,
      );
      const jobs = s.jobs.map((j) =>
        j.id === id
          ? jobEvent(
              { ...j, status: 'Cancelled', cancelReason: reason, tripId: undefined },
              'Booking cancelled',
              at,
              reason,
            )
          : j,
      );
      const prevTrips = s.loads.filter((l) => l.jobId === id && l.tripId).map((l) => l.tripId);
      set({ loads, jobs });
      set(replan(prevTrips, loads, jobs));
    },

    assignJobToTrip,

    createCompanyLoad(input: NewCompanyLoadInput) {
      if (input.tripId) {
        const trip = need(get().trips, input.tripId, 'Trip');
        if (!legOpen(trip, input.leg))
          throw ruleError('TRIP_NOT_EDITABLE', `${trip.id} can no longer take ${input.leg} cargo`);
      }
      const at = stamp();
      const s = get();
      const [id] = newLoadIds(TODAY, 1, s.loads);
      const load: Load = {
        id,
        type: 'Company-Owned',
        leg: input.leg,
        cargoDescription: input.cargoDescription,
        cargoCategory: input.cargoCategory,
        quantity: input.quantity,
        unit: input.unit,
        weightKg: input.weightKg,
        pickup: input.pickup,
        destination: input.destination,
        tripId: input.tripId,
        status: input.tripId ? 'Assigned' : 'Pending',
        handlingNotes: input.handlingNotes,
        estimatedValue: input.estimatedValue,
        createdAt: at,
      };
      const loads = [load, ...s.loads];
      set({ loads });
      if (input.tripId) set(replan([input.tripId], loads, get().jobs));
      return id;
    },

    assignLoadToTrip(loadId: string, tripId: string | null) {
      const s = get();
      const load = need(s.loads, loadId, 'Load');
      if (load.jobId) return assignJobToTrip(load.jobId, tripId);
      if (load.status === 'Delivered' || load.status === 'Cancelled')
        throw ruleError('LOAD_CLOSED', `${loadId} is ${load.status}`);
      const trip = tripId ? need(s.trips, tripId, 'Trip') : undefined;
      if (trip && !(load.leg === 'return' ? canAddReturnCargo(trip) : isTripEditable(trip)))
        throw ruleError('TRIP_NOT_EDITABLE', `${trip.id} can no longer take ${load.leg} cargo`);
      stamp();
      const loads = s.loads.map((l) =>
        l.id === loadId
          ? {
              ...l,
              tripId: tripId ?? undefined,
              status: tripId ? ('Assigned' as const) : ('Pending' as const),
            }
          : l,
      );
      set({ loads });
      set(replan([load.tripId, tripId], loads, s.jobs));
    },

    // ─── Trips ────────────────────────────────────────────────────────
    createTrip(input: NewTripInput) {
      if (!TRUCKS.some((t) => t.id === input.truckId)) throw notFoundError('Truck', input.truckId);
      if (!DRIVERS.some((d) => d.id === input.driverId))
        throw notFoundError('Driver', input.driverId);
      if (!ROUTES.some((r) => r.id === input.routeId)) throw notFoundError('Route', input.routeId);
      const at = stamp();
      const s = get();
      const id = nextSeqId('TRIP', yymmdd(input.date), s.trips, 2);
      const route = routeById(input.routeId);
      const trip: Trip = {
        id,
        date: input.date,
        truckId: input.truckId,
        driverId: input.driverId,
        helperIds: input.helperIds,
        routeId: input.routeId,
        status: 'Planned',
        departure: input.departure,
        expectedReturn: `${input.date}T${route.expectedReturn}`,
        stops: [],
        notes: input.notes,
        history: [{ at, label: 'Trip planned', by: actor() }],
      };
      const r = rebuildTrip(trip, s.loads, s.jobs, s.customers, s.deliveries);
      set({
        trips: [...s.trips, r.trip].sort(
          (a, b) => a.departure.localeCompare(b.departure) || a.truckId.localeCompare(b.truckId),
        ),
        deliveries: r.deliveries,
      });
      return id;
    },

    setTripStatus(tripId: string, status: ManualTripStatus) {
      const trip = need(get().trips, tripId, 'Trip');
      if (!MANUAL_TRIP_TRANSITIONS[status].includes(trip.status))
        throw ruleError(
          'INVALID_TRIP_STATUS',
          `${tripId} is ${trip.status} and cannot move to ${status}`,
        );
      const at = stamp();
      const s = get();
      if (status === 'Cancelled') {
        const loads = s.loads.map((l) =>
          l.tripId === tripId ? { ...l, tripId: undefined, status: 'Pending' as const } : l,
        );
        const jobs = s.jobs.map((j) =>
          j.tripId === tripId
            ? jobEvent(
                { ...j, tripId: undefined, status: 'Awaiting Dispatch' },
                `Removed from ${tripId} (trip cancelled)`,
                at,
              )
            : j,
        );
        set({
          loads,
          jobs,
          trips: s.trips.map((t) =>
            t.id === tripId
              ? tripEvent({ ...t, status: 'Cancelled', stops: [] }, 'Trip cancelled', at)
              : t,
          ),
          deliveries: s.deliveries.filter(
            (d) => d.tripId !== tripId || DELIVERY_DONE.includes(d.status),
          ),
        });
        return;
      }
      const departing = status === 'Dispatched' && !trip.actualDeparture;
      const truck = truckById(trip.truckId);
      const outbound = new Set(
        s.loads.filter((l) => l.tripId === tripId && l.leg === 'outbound').map((l) => l.id),
      );
      const stops = trip.stops.map((st, i) =>
        departing && i === 0
          ? {
              ...st,
              status: 'Completed' as const,
              actualArrival: st.actualArrival ?? st.plannedArrival,
              actualDeparture: at,
            }
          : status === 'Loading' && i === 0 && st.status === 'Pending'
            ? { ...st, status: 'Arrived' as const, actualArrival: at }
            : st,
      );
      const label =
        status === 'Dispatched'
          ? 'Dispatched from Lucena'
          : status === 'Loading'
            ? 'Loading started'
            : 'Loading complete — ready to depart';
      const firstDrop = departing
        ? s.deliveries
            .filter(
              (d) =>
                d.tripId === tripId &&
                !DELIVERY_DONE.includes(d.status) &&
                d.loadIds.some((id) => outbound.has(id)),
            )
            .sort((a, b) => a.eta.localeCompare(b.eta))[0]
        : undefined;
      set({
        trips: s.trips.map((t) =>
          t.id === tripId
            ? tripEvent(
                {
                  ...t,
                  status,
                  stops,
                  actualDeparture: departing ? at : t.actualDeparture,
                  odometerStart: departing
                    ? currentOdometer(truck, s.trips, s.fuelLogs)
                    : t.odometerStart,
                },
                label,
                at,
              )
            : t,
        ),
        loads: s.loads.map((l) => {
          if (l.tripId !== tripId || l.status === 'Delivered' || l.status === 'Cancelled') return l;
          if (status === 'Ready' && l.leg === 'outbound') return { ...l, status: 'Loaded' };
          if (departing && l.leg === 'outbound') return { ...l, status: 'In Transit' };
          return l;
        }),
        jobs: departing
          ? s.jobs.map((j) =>
              j.tripId === tripId && j.leg === 'outbound' && j.status === 'Assigned'
                ? jobEvent({ ...j, status: 'In Transit' }, `Dispatched on ${tripId}`, at)
                : j,
            )
          : s.jobs,
        deliveries: s.deliveries.map((d) => {
          if (d.tripId !== tripId || DELIVERY_DONE.includes(d.status)) return d;
          if (status === 'Loading') return { ...d, status: 'Loading' };
          if (status === 'Ready') return { ...d, status: 'Ready' };
          if (departing)
            return { ...d, status: firstDrop?.id === d.id ? 'In Transit' : 'Scheduled' };
          return d;
        }),
      });
    },

    completeTrip(tripId: string, close: TripCloseInput) {
      const trip = need(get().trips, tripId, 'Trip');
      if (!['Dispatched', 'In Transit', 'Returning'].includes(trip.status))
        throw ruleError(
          'INVALID_TRIP_STATUS',
          `${tripId} is ${trip.status}; only trips on the road can be closed`,
        );
      if (trip.odometerStart !== undefined && close.odometerEnd < trip.odometerStart)
        throw ruleError(
          'ODOMETER_BEFORE_START',
          `Odometer ${close.odometerEnd} km is below the departure reading ${trip.odometerStart} km`,
        );
      const at = stamp();
      const s = get();
      const failedJobs = new Set(
        s.deliveries
          .filter((d) => d.tripId === tripId && (d.status === 'Failed' || d.status === 'Returned'))
          .map((d) => d.jobId),
      );
      set({
        trips: s.trips.map((t) =>
          t.id === tripId
            ? tripEvent(
                {
                  ...t,
                  status: 'Completed',
                  actualReturn: at,
                  odometerEnd: close.odometerEnd,
                  stops: t.stops.map((st) =>
                    st.status === 'Completed' || st.status === 'Skipped'
                      ? st
                      : {
                          ...st,
                          status: 'Completed',
                          actualArrival: st.actualArrival ?? at,
                          actualDeparture: st.actualDeparture ?? at,
                        },
                  ),
                },
                'Returned to Lucena — trip closed',
                at,
                `Odometer ${close.odometerEnd.toLocaleString('en-PH')} km`,
              )
            : t,
        ),
        loads: s.loads.map((l) => {
          if (l.tripId !== tripId || l.status === 'Cancelled' || l.status === 'Delivered') return l;
          if (l.jobId && failedJobs.has(l.jobId))
            return { ...l, tripId: undefined, status: 'Pending', pickup: LUCENA_WAREHOUSE };
          return { ...l, status: 'Delivered' };
        }),
        jobs: s.jobs.map((j) => {
          if (j.tripId !== tripId) return j;
          if (failedJobs.has(j.id))
            return jobEvent(
              { ...j, tripId: undefined, status: 'Awaiting Dispatch', pickup: LUCENA_WAREHOUSE },
              'Cargo back at Lucena bodega — to be rescheduled',
              at,
            );
          if (j.status === 'Delivered')
            return jobEvent({ ...j, status: 'Completed' }, `${tripId} closed`, at);
          return j;
        }),
      });
      if (close.fuel)
        addFuelLog({
          truckId: trip.truckId,
          tripId,
          driverId: trip.driverId,
          date: at,
          odometerKm: close.odometerEnd,
          liters: close.fuel.liters,
          pricePerLiter: close.fuel.pricePerLiter,
          station: close.fuel.station,
          areaId: 'lucena',
          fullTank: true,
        });
    },

    markStopArrived(tripId: string, stopId: string) {
      const trip = need(get().trips, tripId, 'Trip');
      need(trip.stops, stopId, 'Stop');
      if (trip.status === 'Completed' || trip.status === 'Cancelled')
        throw ruleError('TRIP_CLOSED', `${tripId} is ${trip.status}`);
      const at = stamp();
      set((s) => ({
        trips: s.trips.map((t) =>
          t.id === tripId
            ? {
                ...t,
                status: t.status === 'Dispatched' ? 'In Transit' : t.status,
                stops: t.stops.map((st) =>
                  st.id === stopId ? { ...st, status: 'Arrived', actualArrival: at } : st,
                ),
              }
            : t,
        ),
      }));
    },

    completeStop(tripId: string, stopId: string) {
      const trip = need(get().trips, tripId, 'Trip');
      const stop = need(trip.stops, stopId, 'Stop');
      if (trip.status === 'Completed' || trip.status === 'Cancelled')
        throw ruleError('TRIP_CLOSED', `${tripId} is ${trip.status}`);
      const at = stamp();
      const s = get();
      const loaded = new Set(stop.loaded);
      const unloadedAtWarehouse =
        stop.type === 'Warehouse' ? new Set(stop.unloaded) : new Set<string>();
      const pickedJobs = new Set(
        s.loads
          .filter((l) => loaded.has(l.id) && l.leg === 'return' && l.jobId)
          .map((l) => l.jobId!),
      );
      set({
        trips: s.trips.map((t) =>
          t.id === tripId
            ? tripEvent(
                {
                  ...t,
                  status: t.status === 'Dispatched' ? 'In Transit' : t.status,
                  stops: t.stops.map((st) =>
                    st.id === stopId
                      ? {
                          ...st,
                          status: 'Completed',
                          actualArrival: st.actualArrival ?? at,
                          actualDeparture: at,
                        }
                      : st,
                  ),
                },
                `${stop.type === 'Backhaul Pickup' ? 'Backhaul loaded' : stop.type === 'Warehouse' ? 'Unloaded' : 'Stop completed'} — ${stop.location.name}`,
                at,
              )
            : t,
        ),
        loads: s.loads.map((l) =>
          loaded.has(l.id) && l.leg === 'return'
            ? { ...l, status: 'In Transit' }
            : unloadedAtWarehouse.has(l.id)
              ? { ...l, status: 'Delivered' }
              : l,
        ),
        jobs: s.jobs.map((j) =>
          pickedJobs.has(j.id) && j.status === 'Assigned'
            ? jobEvent({ ...j, status: 'In Transit' }, `Picked up at ${stop.location.name}`, at)
            : j,
        ),
      });
    },

    // ─── Deliveries & POD ─────────────────────────────────────────────
    markArrived(deliveryId: string) {
      const d = need(get().deliveries, deliveryId, 'Delivery');
      if (DELIVERY_DONE.includes(d.status))
        throw ruleError('DELIVERY_CLOSED', `${deliveryId} is already ${d.status}`);
      const at = stamp();
      const s = get();
      set({
        deliveries: s.deliveries.map((x) =>
          x.id === deliveryId ? { ...x, status: 'Arrived', arrivedAt: at } : x,
        ),
        trips: s.trips.map((t) =>
          t.id === d.tripId
            ? {
                ...t,
                status: t.status === 'Dispatched' ? 'In Transit' : t.status,
                stops: t.stops.map((st) =>
                  st.unloaded.some((id) => d.loadIds.includes(id)) && st.status === 'Pending'
                    ? { ...st, status: 'Arrived', actualArrival: at }
                    : st,
                ),
              }
            : t,
        ),
      });
    },

    markDelivered(deliveryId: string, podInput: PodInput, cashCollected?: number) {
      const dl = need(get().deliveries, deliveryId, 'Delivery');
      if (DELIVERY_DONE.includes(dl.status))
        throw ruleError('DELIVERY_CLOSED', `${deliveryId} is already ${dl.status}`);
      const at = stamp();
      const s = get();
      const trip = need(s.trips, dl.tripId, 'Trip');
      const driver = driverById(trip.driverId).name;
      const drNo =
        podInput.receiptNo ||
        `DR-${String(
          maxNum(
            s.deliveries.map((d) => d.pod?.receiptNo ?? ''),
            /DR-(\d+)/,
          ) + 1,
        ).padStart(6, '0')}`;
      const pod: ProofOfDelivery = { ...podInput, receiptNo: drNo, signedAt: at };
      const loadIds = new Set(dl.loadIds);
      const deliveries = s.deliveries.map((d) =>
        d.id === deliveryId
          ? {
              ...d,
              status: 'Delivered' as const,
              arrivedAt: d.arrivedAt ?? at,
              completedAt: at,
              pod,
            }
          : d,
      );
      const open = deliveries
        .filter((d) => d.tripId === trip.id && !DELIVERY_DONE.includes(d.status))
        .sort((a, b) => a.eta.localeCompare(b.eta));
      const nextDl = open[0];
      const stops = trip.stops.map((st) => {
        if (!st.unloaded.some((id) => loadIds.has(id))) return st;
        const stillOpen = deliveries.some(
          (d) =>
            d.tripId === trip.id &&
            !DELIVERY_DONE.includes(d.status) &&
            d.loadIds.some((id) => st.unloaded.includes(id)),
        );
        return stillOpen
          ? { ...st, status: 'Arrived' as const, actualArrival: st.actualArrival ?? at }
          : {
              ...st,
              status: 'Completed' as const,
              actualArrival: st.actualArrival ?? at,
              actualDeparture: at,
            };
      });
      const outboundLeft = open.some((d) =>
        s.loads.some((l) => d.loadIds.includes(l.id) && l.leg === 'outbound'),
      );
      const nextStatus: TripStatus =
        !outboundLeft && ['Dispatched', 'In Transit'].includes(trip.status)
          ? 'Returning'
          : trip.status === 'Dispatched'
            ? 'In Transit'
            : trip.status;
      set({
        deliveries: deliveries.map((d) =>
          nextDl && d.id === nextDl.id && d.status === 'Scheduled'
            ? { ...d, status: 'In Transit' }
            : d,
        ),
        trips: s.trips.map((t) =>
          t.id === trip.id
            ? nextStatus !== trip.status && nextStatus === 'Returning'
              ? tripEvent(
                  { ...t, stops, status: nextStatus },
                  'All outbound drops done — returning to Lucena',
                  at,
                  undefined,
                  driver,
                )
              : { ...t, stops, status: nextStatus }
            : t,
        ),
        loads: s.loads.map((l) => (loadIds.has(l.id) ? { ...l, status: 'Delivered' } : l)),
        jobs: s.jobs.map((j) =>
          j.id === dl.jobId
            ? jobEvent(
                { ...j, status: 'Delivered', deliveredAt: at },
                'Delivered — POD captured',
                at,
                `Received by ${pod.receivedBy} · ${drNo}${pod.photoCount ? ` · ${pod.photoCount} photo(s)` : ''}`,
                driver,
              )
            : j,
        ),
      });
      if (cashCollected && cashCollected > 0) {
        const job = need(get().jobs, dl.jobId, 'Job');
        pay({
          invoiceId: invoiceIdForJob(job.id),
          jobId: job.id,
          customerId: job.customerId,
          amount: Math.min(cashCollected, jobTotal(job)),
          method: 'COD',
          reference: 'Cash collected by driver',
          notes: `Collected by ${driver}`,
        });
      }
    },

    updatePod(deliveryId: string, patch: Partial<ProofOfDelivery>) {
      const d = need(get().deliveries, deliveryId, 'Delivery');
      if (!d.pod) throw ruleError('NO_POD', `${deliveryId} has no proof of delivery yet`);
      stamp();
      set((s) => ({
        deliveries: s.deliveries.map((x) =>
          x.id === deliveryId && x.pod ? { ...x, pod: { ...x.pod, ...patch } } : x,
        ),
      }));
    },

    reportDeliveryIssue(deliveryId: string, issue: DeliveryIssueInput, failed?: boolean) {
      const dl = need(get().deliveries, deliveryId, 'Delivery');
      const at = stamp();
      const s = get();
      const c = s.customers.find((x) => x.id === dl.customerId);
      set({
        deliveries: s.deliveries.map((d) =>
          d.id === deliveryId
            ? {
                ...d,
                issues: [...d.issues, { ...issue, reportedAt: at, reportedBy: actor() }],
                status: failed ? 'Failed' : d.status,
                failureReason: failed ? issue.note : d.failureReason,
              }
            : d,
        ),
        jobs: s.jobs.map((j) =>
          j.id === dl.jobId
            ? jobEvent(
                j,
                failed
                  ? 'Delivery failed — cargo returning to Lucena'
                  : `Issue reported: ${issue.type}`,
                at,
                issue.note,
              )
            : j,
        ),
      });
      notify({
        kind: 'delivery',
        title: failed ? 'Delivery failed' : `Delivery issue: ${issue.type}`,
        body: `${dl.jobId} · ${c?.name ?? ''} — ${issue.note}`,
        href: `/deliveries/${deliveryId}`,
        severity: failed ? 'critical' : 'warning',
        roles: ['owner', 'dispatcher', 'sales'],
      });
    },

    // ─── Finance ──────────────────────────────────────────────────────
    recordPayment(input: NewPaymentInput) {
      const s = get();
      const job = need(s.jobs, input.jobId, 'Job');
      if (input.customerId !== job.customerId || input.invoiceId !== invoiceIdForJob(job.id))
        throw ruleError(
          'INVOICE_MISMATCH',
          `${input.invoiceId} does not belong to ${job.id} / ${input.customerId}`,
        );
      if (!isBillableJob(job))
        throw ruleError(
          'NOT_INVOICED',
          `${job.id} is not delivered yet, so there is no invoice to pay`,
        );
      const invoice = getInvoices(s.jobs, s.payments).find((i) => i.id === input.invoiceId);
      if (invoice && input.amount > invoice.balance)
        throw ruleError(
          'OVERPAYMENT',
          `₱${input.amount.toLocaleString('en-PH')} is more than the ₱${invoice.balance.toLocaleString('en-PH')} balance`,
        );
      return pay(input);
    },

    addExpense(e: NewExpenseInput) {
      const s = get();
      if (e.tripId) need(s.trips, e.tripId, 'Trip');
      if (e.truckId && !TRUCKS.some((t) => t.id === e.truckId))
        throw notFoundError('Truck', e.truckId);
      if (e.driverId && !DRIVERS.some((d) => d.id === e.driverId))
        throw notFoundError('Driver', e.driverId);
      return addExpense(e);
    },

    // ─── Fleet ────────────────────────────────────────────────────────
    addFuelLog(input: NewFuelLogInput) {
      if (!TRUCKS.some((t) => t.id === input.truckId)) throw notFoundError('Truck', input.truckId);
      if (!DRIVERS.some((d) => d.id === input.driverId))
        throw notFoundError('Driver', input.driverId);
      if (input.tripId) need(get().trips, input.tripId, 'Trip');
      return addFuelLog(input);
    },

    addMaintenance(m: NewMaintenanceInput) {
      if (!TRUCKS.some((t) => t.id === m.truckId)) throw notFoundError('Truck', m.truckId);
      const s = get();
      const id = `MNT-${String(
        maxNum(
          s.maintenance.map((x) => x.id),
          /MNT-(\d+)/,
        ) + 1,
      ).padStart(3, '0')}`;
      set({ maintenance: [{ ...m, id }, ...s.maintenance] });
      if (m.status === 'Scheduled')
        notify({
          kind: 'fleet',
          title: 'Maintenance scheduled',
          body: `${truckById(m.truckId).code}: ${m.type} on ${m.date} (${m.vendor}).`,
          href: '/maintenance',
          severity: 'info',
          roles: ['owner', 'dispatcher'],
        });
      return id;
    },

    setMaintenanceStatus(id: string, status: MaintenanceStatus, patch?: MaintenanceUpdateInput) {
      need(get().maintenance, id, 'Maintenance record');
      stamp();
      set((s) => ({
        maintenance: s.maintenance.map((m) => (m.id === id ? { ...m, ...patch, status } : m)),
      }));
    },

    renewDocument(id: string, patch: DocumentRenewalInput) {
      need(get().documents, id, 'Document');
      stamp();
      set((s) => ({
        documents: s.documents.map((d) =>
          d.id === id ? { ...d, ...patch, notes: `Renewed ${TODAY}.` } : d,
        ),
      }));
    },

    // ─── Load board ───────────────────────────────────────────────────
    postBoardLoad(input: NewBoardLoadInput) {
      const s = get();
      if (input.partnerId) need(s.truckingPartners, input.partnerId, 'Trucking partner');
      if (input.customerId) need(s.customers, input.customerId, 'Customer');
      const at = stamp();
      const id = nextSeqId('FRT', yymmdd(at), s.boardLoads);
      set((st) => ({
        boardLoads: [
          { ...input, id, status: 'Looking for Truck', createdAt: at, postedBy: actor() },
          ...st.boardLoads,
        ],
      }));
      return id;
    },

    postCapacity(input: NewCapacityInput) {
      const s = get();
      if (input.fleet === 'internal') {
        const trip = need(s.trips, input.tripId, 'Trip');
        if (trip.status === 'Completed' || trip.status === 'Cancelled')
          throw ruleError('TRIP_CLOSED', `${trip.id} is ${trip.status}`);
      }
      if (input.partnerId) need(s.truckingPartners, input.partnerId, 'Trucking partner');
      const at = stamp();
      const id = nextSeqId('CAP', yymmdd(at), s.boardCapacity);
      const post = {
        ...input,
        id,
        status: 'Open',
        createdAt: at,
        postedBy: actor(),
      } as AvailableCapacity;
      set((st) => ({ boardCapacity: [post, ...st.boardCapacity] }));
      return id;
    },

    addTruckingPartner(input: NewPartnerInput) {
      const s = get();
      const id = `TP-${String(
        maxNum(
          s.truckingPartners.map((p) => p.id),
          /TP-(\d+)/,
        ) + 1,
      ).padStart(3, '0')}`;
      set({ truckingPartners: [...s.truckingPartners, { ...input, id, since: TODAY }] });
      return id;
    },

    setBoardLoadStatus(id: string, status: AvailableLoadStatus, reason?: string) {
      const load = need(get().boardLoads, id, 'Board load');
      if (load.jobId)
        throw ruleError(
          'BOARD_LOAD_BOOKED',
          `${id} is booked as ${load.jobId}; its status follows the job`,
        );
      stamp();
      const s = get();
      // Leaving a partner-truck reservation (other than confirming it) gives the space back.
      const release =
        load.status === 'Reserved' &&
        load.capacityId &&
        status !== 'Booked' &&
        status !== 'Reserved'
          ? load.capacityId
          : undefined;
      set({
        boardLoads: s.boardLoads.map((l) =>
          l.id === id
            ? {
                ...l,
                status,
                capacityId: release ? undefined : l.capacityId,
                bookedAt: release ? undefined : l.bookedAt,
                closedReason:
                  status === 'Looking for Truck' || status === 'Matching'
                    ? undefined
                    : (reason ?? l.closedReason),
              }
            : l,
        ),
        boardCapacity: release
          ? s.boardCapacity.map((c) =>
              c.id === release && c.fleet === 'external'
                ? { ...c, usedCapacityKg: Math.max(0, c.usedCapacityKg - load.weightKg) }
                : c,
            )
          : s.boardCapacity,
      });
    },

    setCapacityStatus(id: string, status: CapacityStatus, reason?: string) {
      need(get().boardCapacity, id, 'Capacity post');
      stamp();
      set((s) => ({
        boardCapacity: s.boardCapacity.map((c) =>
          c.id === id ? { ...c, status, closedReason: reason ?? c.closedReason } : c,
        ),
      }));
    },

    updateCapacityUsed(id: string, usedKg: number) {
      const cap = need(get().boardCapacity, id, 'Capacity post');
      if (cap.fleet !== 'external')
        throw ruleError(
          'INTERNAL_CAPACITY',
          'Space on our own trucks is read from the trip’s loads',
        );
      stamp();
      set((s) => ({
        boardCapacity: s.boardCapacity.map((c) =>
          c.id === id && c.fleet === 'external'
            ? { ...c, usedCapacityKg: Math.min(c.totalCapacityKg, Math.max(0, usedKg)) }
            : c,
        ),
      }));
    },

    reserveOnPartnerTruck(loadId: string, capacityId: string) {
      const s = get();
      const load = need(s.boardLoads, loadId, 'Board load');
      const cap = need(s.boardCapacity, capacityId, 'Capacity post');
      if (cap.fleet !== 'external')
        throw ruleError('INTERNAL_CAPACITY', 'Book loads onto our own trips instead of reserving');
      if (load.jobId)
        throw ruleError('BOARD_LOAD_BOOKED', `${loadId} is already booked as ${load.jobId}`);
      if (load.capacityId === capacityId) return;
      const at = stamp();
      set({
        boardLoads: s.boardLoads.map((l) =>
          l.id === loadId ? { ...l, status: 'Reserved', capacityId, bookedAt: at } : l,
        ),
        boardCapacity: s.boardCapacity.map((c) =>
          c.id === capacityId && c.fleet === 'external'
            ? {
                ...c,
                usedCapacityKg: Math.min(c.totalCapacityKg, c.usedCapacityKg + load.weightKg),
              }
            : c,
        ),
      });
    },

    bookBoardLoad(input: BookBoardLoadInput): BookingResult {
      const s = get();
      const load = need(s.boardLoads, input.loadId, 'Board load');
      const cap = input.capacityId
        ? need(s.boardCapacity, input.capacityId, 'Capacity post')
        : undefined;
      if (input.customerId) need(s.customers, input.customerId, 'Customer');
      const tripId = cap?.fleet === 'internal' ? cap.tripId : undefined;

      // Already booked: never create a second job or load — at most move it onto the trip.
      const existing = load.jobId ? s.jobs.find((j) => j.id === load.jobId) : undefined;
      if (existing && existing.status !== 'Cancelled') {
        if (tripId && existing.tripId !== tripId) assignJob(existing.id, tripId);
        set((st) => ({
          boardLoads: st.boardLoads.map((l) =>
            l.id === load.id ? { ...l, capacityId: cap?.id ?? l.capacityId } : l,
          ),
        }));
        return { jobId: existing.id, created: false };
      }

      let customerId = input.customerId || load.customerId;
      if (!customerId) {
        const partner = load.partnerId
          ? s.truckingPartners.find((p) => p.id === load.partnerId)
          : undefined;
        customerId = addShipperCustomer({
          name: input.newCustomerName?.trim() || partner?.name || load.contact.name,
          contact: load.contact,
          place: load.pickup,
          addressLabel: 'Pickup point',
          category: load.cargoCategory,
          paymentTerms: input.paymentTerms,
          leadSource: leadSourceFor(load.source),
          notes: `First booked through Load Board ${load.id} (${load.source}${load.sourceReference ? ` · ${load.sourceReference}` : ''}).`,
        });
      }

      const at = stamp();
      const built = buildJob(
        {
          customerId,
          source: 'Load Board',
          leg: bookingLeg(load, cap),
          pickup: load.pickup,
          dropoff: load.destination,
          consignee: input.consignee,
          cargo: [
            {
              cargoDescription: load.cargoDescription,
              cargoCategory: load.cargoCategory,
              quantity: load.weightKg,
              unit: 'kg',
              weightKg: load.weightKg,
              handlingNotes: load.specialHandling,
            },
          ],
          truckRequirement: truckRequirementFor(load),
          pickupAt: load.pickupAt,
          requiredBy: requiredByFor(load),
          freightCharge: input.freightCharge,
          additionalCharges: [],
          paymentTerms: input.paymentTerms,
          instructions: load.specialHandling,
          notes: load.notes,
          status: 'Awaiting Dispatch',
          loadType: 'Third-Party',
        },
        at,
      );
      const job = jobEvent(
        built.job,
        `Booked from Load Board ${load.id}`,
        at,
        `${load.source}${load.sourceReference ? ` · ${load.sourceReference}` : ''} · posted by ${load.contact.name}`,
      );
      set((st) => ({
        jobs: [job, ...st.jobs],
        loads: [...built.loads, ...st.loads],
        boardLoads: st.boardLoads.map((l) =>
          l.id === load.id
            ? { ...l, customerId, jobId: job.id, capacityId: cap?.id, bookedAt: at }
            : l,
        ),
      }));
      if (tripId) assignJob(job.id, tripId);
      const trip = tripId ? get().trips.find((t) => t.id === tripId) : undefined;
      notify({
        kind: 'job',
        title: 'Load Board booking',
        body: `${load.id} → ${job.id}: ${load.cargoDescription}, ${load.weightKg.toLocaleString('en-PH')} kg${trip ? ` on ${truckById(trip.truckId).code} (${trip.id})` : ' — awaiting dispatch'}.`,
        href: `/jobs/${job.id}`,
        severity: 'info',
        roles: ['owner', 'dispatcher'],
      });
      return { jobId: job.id, created: true };
    },

    // ─── Backhaul marketplace (preview) ───────────────────────────────
    publishBackhaulListing(input: PublishListingInput) {
      const s = get();
      const trip = need(s.trips, input.tripId, 'Trip');
      if (!legOpen(trip, 'return'))
        throw ruleError('RETURN_LEG_CLOSED', `${trip.id}'s return leg can no longer take cargo`);
      const at = stamp();
      // One listing per return leg: publishing again updates the terms and reopens it.
      const existing = s.backhaulListings.find((l) => l.tripId === input.tripId);
      if (existing) {
        set({
          backhaulListings: s.backhaulListings.map((l) =>
            l.id === existing.id
              ? {
                  ...l,
                  ...input,
                  status: 'Published',
                  publishedAt: l.status === 'Published' ? l.publishedAt : at,
                  publishedBy: l.status === 'Published' ? l.publishedBy : actor(),
                }
              : l,
          ),
        });
        return existing.id;
      }
      const id = nextSeqId('BHL', yymmdd(at), s.backhaulListings);
      const listing: BackhaulListing = {
        ...input,
        id,
        status: 'Published',
        publishedAt: at,
        publishedBy: actor(),
      };
      set({ backhaulListings: [listing, ...s.backhaulListings] });
      return id;
    },

    setBackhaulListingStatus(id: string, status: BackhaulListing['status']) {
      need(get().backhaulListings, id, 'Listing');
      stamp();
      set((s) => ({
        backhaulListings: s.backhaulListings.map((l) => (l.id === id ? { ...l, status } : l)),
      }));
    },

    requestBackhaulSpace(input: NewBackhaulRequestInput) {
      const s = get();
      const listing = need(s.backhaulListings, input.listingId, 'Listing');
      const trip = need(s.trips, listing.tripId, 'Trip');
      const space = returnSpace(trip.id);
      if (listingStatus(listing, trip, space) !== 'Published')
        throw ruleError('LISTING_NOT_OPEN', 'This return trip is no longer taking requests');
      if (input.weightKg > space)
        throw ruleError(
          'NOT_ENOUGH_SPACE',
          `Only ${space.toLocaleString('en-PH')} kg is left on this return trip`,
        );
      const at = stamp();
      const id = nextSeqId('BKR', yymmdd(at), s.backhaulRequests);
      const request: BackhaulBookingRequest = {
        ...input,
        id,
        quotedFreight: marketplaceQuote(listing, input.weightKg),
        status: 'Requested',
        createdAt: at,
      };
      set((st) => ({ backhaulRequests: [request, ...st.backhaulRequests] }));
      notify({
        kind: 'backhaul',
        title: 'Backhaul space requested',
        body: `${input.shipper.businessName}: ${input.weightKg.toLocaleString('en-PH')} kg ${input.cargoDescription}, ${shortArea(input.pickup.areaId)} → ${shortArea(input.dropoff.areaId)} on ${truckById(trip.truckId).code}'s return (${trip.id}).`,
        href: `/future/backhaul-marketplace?tab=requests&q=${id}`,
        severity: 'info',
        roles: ['owner', 'dispatcher'],
      });
      return id;
    },

    confirmBackhaulRequest(input: ConfirmBackhaulRequestInput): BookingResult {
      const s = get();
      const req = need(s.backhaulRequests, input.requestId, 'Backhaul request');
      // Already confirmed: never create a second job or load.
      if (req.jobId) return { jobId: req.jobId, created: false };
      if (req.status !== 'Requested')
        throw ruleError('REQUEST_CLOSED', `${req.id} was already ${req.status.toLowerCase()}`);
      if (input.customerId) need(s.customers, input.customerId, 'Customer');
      const listing = need(s.backhaulListings, req.listingId, 'Listing');
      const trip = need(s.trips, listing.tripId, 'Trip');
      if (listing.status === 'Closed' || !legOpen(trip, 'return'))
        throw ruleError('RETURN_LEG_CLOSED', `${trip.id}'s return leg can no longer take cargo`);
      if (req.weightKg > returnSpace(trip.id))
        throw ruleError(
          'NOT_ENOUGH_SPACE',
          `${trip.id} no longer has ${req.weightKg.toLocaleString('en-PH')} kg free`,
        );

      const customerId =
        input.customerId ||
        req.customerId ||
        addShipperCustomer({
          name: req.shipper.businessName,
          contact: { name: req.shipper.contactName, phone: req.shipper.phone },
          place: req.dropoff,
          addressLabel: 'Receiving address',
          category: req.cargoCategory,
          paymentTerms: input.paymentTerms,
          leadSource: 'Backhaul Marketplace',
          notes: `First booked through Backhaul Marketplace request ${req.id}.`,
        });

      const at = stamp();
      const built = buildJob(
        {
          customerId,
          source: 'Backhaul Marketplace',
          leg: 'return',
          pickup: req.pickup,
          dropoff: req.dropoff,
          consignee: req.consignee ?? { name: req.shipper.contactName, phone: req.shipper.phone },
          cargo: [
            {
              cargoDescription: req.cargoDescription,
              cargoCategory: req.cargoCategory,
              quantity: req.quantity,
              unit: req.unit,
              weightKg: req.weightKg,
            },
          ],
          truckRequirement: truckRequirementFor({
            weightKg: req.weightKg,
            cargoCategory: req.cargoCategory,
            truckType: 'Any Closed Van',
          }),
          pickupAt: req.readyAt,
          requiredBy: requiredByFor({ pickupAt: req.readyAt }),
          freightCharge: input.freightCharge,
          additionalCharges: [],
          paymentTerms: input.paymentTerms,
          notes: req.notes,
          status: 'Awaiting Dispatch',
          loadType: 'Third-Party',
        },
        at,
      );
      const job = jobEvent(
        built.job,
        `Booked from Backhaul Marketplace request ${req.id}`,
        at,
        `${req.shipper.businessName} · instant quote ₱${req.quotedFreight.toLocaleString('en-PH')}`,
      );
      set((st) => ({
        jobs: [job, ...st.jobs],
        loads: [...built.loads, ...st.loads],
        backhaulRequests: st.backhaulRequests.map((r) =>
          r.id === req.id
            ? {
                ...r,
                customerId,
                status: 'Confirmed',
                jobId: job.id,
                respondedAt: at,
                respondedBy: actor(),
              }
            : r,
        ),
      }));
      assignJob(job.id, trip.id);
      notify({
        kind: 'job',
        title: 'Marketplace booking confirmed',
        body: `${req.id} → ${job.id}: ${req.cargoDescription}, ${req.weightKg.toLocaleString('en-PH')} kg on ${truckById(trip.truckId).code}'s return leg (${trip.id}).`,
        href: `/jobs/${job.id}`,
        severity: 'success',
        roles: ['owner', 'dispatcher'],
      });
      return { jobId: job.id, created: true };
    },

    declineBackhaulRequest(id: string, reason: string) {
      const req = need(get().backhaulRequests, id, 'Backhaul request');
      if (req.status !== 'Requested' || req.jobId)
        throw ruleError('REQUEST_CLOSED', `${id} was already ${req.status.toLowerCase()}`);
      const at = stamp();
      set((s) => ({
        backhaulRequests: s.backhaulRequests.map((r) =>
          r.id === id
            ? {
                ...r,
                status: 'Declined',
                declineReason: reason,
                respondedAt: at,
                respondedBy: actor(),
              }
            : r,
        ),
      }));
    },

    // ─── Notifications ────────────────────────────────────────────────
    markNotificationRead(id: string) {
      need(get().notifications, id, 'Notification');
      set((s) => ({
        notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      }));
    },

    markAllNotificationsRead() {
      set((s) => ({
        notifications: s.notifications.map((n) => (n.read ? n : { ...n, read: true })),
      }));
    },

    // ─── Trading (Phase 2 preview) ────────────────────────────────────
    createOrder(input: NewOrderInput) {
      const customer = need(get().customers, input.customerId, 'Customer');
      if (!customer.addresses.some((a) => a.id === input.addressId))
        throw ruleError(
          'ADDRESS_MISMATCH',
          `${input.addressId} is not one of ${customer.name}'s addresses`,
        );
      for (const i of input.items)
        if (!PRODUCTS.some((p) => p.id === i.productId))
          throw notFoundError('Product', i.productId);
      const prefix = `FR-${yymmdd(input.deliveryDate)}-`;
      const seq =
        get()
          .orders.filter((o) => o.id.startsWith(prefix))
          .reduce((m, o) => Math.max(m, Number(o.id.slice(-3))), 0) + 1;
      const id = `${prefix}${String(seq).padStart(3, '0')}`;
      const at = stamp();
      const order: Order = {
        id,
        customerId: input.customerId,
        source: input.source,
        items: input.items,
        discount: input.discount,
        deliveryFee: input.deliveryFee,
        status: input.status,
        paymentTerms: input.paymentTerms,
        addressId: input.addressId,
        createdAt: at,
        deliveryDate: input.deliveryDate,
        deliveryWindow:
          input.deliveryWindow ??
          customer.addresses.find((a) => a.id === input.addressId)?.receivingHours,
        fulfillment: input.fulfillment ?? customer.fulfillment,
        salespersonId: customer.salespersonId,
        notes: input.notes,
        history: [
          {
            at,
            label:
              input.source === 'Customer Portal'
                ? 'Order submitted via Customer Portal'
                : `Order recorded (${input.source})`,
            by: actor(),
          },
          ...(input.status === 'Confirmed' ? [{ at, label: 'Order confirmed', by: actor() }] : []),
        ],
      };
      set((s) => ({ orders: [order, ...s.orders] }));
      if (input.status === 'Pending Confirmation')
        notify({
          kind: 'order',
          title: 'Order needs confirmation',
          body: `Order ${id} (${customer.name}) needs confirmation.`,
          href: `/orders/${id}`,
          severity: 'warning',
          roles: ['owner', 'sales'],
        });
      return id;
    },

    updateOrder(id: string, patch: OrderEditInput, event?: { label: string; note?: string }) {
      const order = need(get().orders, id, 'Order');
      if (order.status === 'Cancelled' || order.status === 'Delivered')
        throw ruleError('ORDER_CLOSED', `${id} is ${order.status}`);
      const at = event ? stamp() : '';
      set((s) => ({
        orders: s.orders.map((o) =>
          o.id === id
            ? {
                ...o,
                ...patch,
                history: event
                  ? [...o.history, { at, label: event.label, by: actor(), note: event.note }]
                  : o.history,
              }
            : o,
        ),
      }));
    },

    setOrderStatus(id: string, status: OrderStatus, note?: string) {
      need(get().orders, id, 'Order');
      const at = stamp();
      set((s) => ({
        orders: s.orders.map((o) => {
          if (o.id !== id) return o;
          const label =
            status === 'Confirmed'
              ? 'Order confirmed'
              : status === 'Delivered'
                ? o.fulfillment === 'pickup'
                  ? 'Picked up at bodega'
                  : 'Delivered'
                : `Status changed to ${status}`;
          return {
            ...o,
            status,
            deliveredAt: status === 'Delivered' ? at : o.deliveredAt,
            history: [...o.history, { at, label, by: actor(), note }],
          };
        }),
      }));
    },

    cancelOrder(id: string, reason: string) {
      need(get().orders, id, 'Order');
      const at = stamp();
      set((s) => ({
        orders: s.orders.map((o) =>
          o.id === id
            ? {
                ...o,
                status: 'Cancelled',
                cancelReason: reason,
                history: [
                  ...o.history,
                  { at, label: 'Order cancelled', by: actor(), note: reason },
                ],
              }
            : o,
        ),
      }));
    },

    recordSalesPayment(input: NewSalesPaymentInput) {
      const s = get();
      need(s.orders, input.orderId, 'Order');
      const date = stamp();
      const id = nextSeqId('SP', yymmdd(date), s.salesPayments);
      const receiptNo = `SR-${String(
        maxNum(
          s.salesPayments.map((p) => p.receiptNo),
          /SR-(\d+)/,
        ) + 1,
      ).padStart(6, '0')}`;
      const payment: SalesPayment = { ...input, id, receiptNo, date, recordedBy: actor() };
      set((st) => ({
        salesPayments: [...st.salesPayments, payment],
        orders: st.orders.map((o) =>
          o.id === input.orderId
            ? {
                ...o,
                history: [
                  ...o.history,
                  {
                    at: date,
                    label: `Payment received — ₱${input.amount.toLocaleString('en-PH')}`,
                    by: payment.recordedBy,
                    note: `${input.method} · ${receiptNo}`,
                  },
                ],
              }
            : o,
        ),
      }));
      return receiptNo;
    },

    createPO(input: NewPOInput) {
      if (!SUPPLIERS.some((x) => x.id === input.supplierId))
        throw notFoundError('Supplier', input.supplierId);
      const s = get();
      const id = nextSeqId('PO', yymmdd(TODAY), s.purchaseOrders);
      const sup = supplierById(input.supplierId);
      const po = {
        id,
        supplierId: input.supplierId,
        items: input.items,
        status: input.status,
        createdAt: stamp(),
        pickupDate: input.pickupDate,
        pickupLocation: sup.pickupLocation,
        pickupAreaId: sup.pickupAreaId,
        createdBy: actor(),
        notes: input.notes,
      };
      set({ purchaseOrders: [po, ...s.purchaseOrders] });
      return id;
    },

    setPOStatus(id: string, status: POStatus) {
      need(get().purchaseOrders, id, 'Purchase order');
      const at = stamp();
      set((s) => ({
        purchaseOrders: s.purchaseOrders.map((p) =>
          p.id === id
            ? {
                ...p,
                status,
                pickedUpAt: status === 'Picked Up' ? at : p.pickedUpAt,
                receivedAt: status === 'Received' ? at : p.receivedAt,
                items:
                  status === 'Received'
                    ? p.items.map((i) => ({ ...i, receivedQty: i.receivedQty ?? i.quantity }))
                    : p.items,
              }
            : p,
        ),
      }));
    },

    setStandingOrderStatus(id: string, status: StandingOrder['status']) {
      need(get().standingOrders, id, 'Standing order');
      set((s) => ({
        standingOrders: s.standingOrders.map((so) => (so.id === id ? { ...so, status } : so)),
      }));
    },

    saveStandingOrder(so: StandingOrderInput) {
      need(get().customers, so.customerId, 'Customer');
      const s = get();
      if (so.id && s.standingOrders.some((x) => x.id === so.id)) {
        set({
          standingOrders: s.standingOrders.map((x) =>
            x.id === so.id ? ({ ...x, ...so } as StandingOrder) : x,
          ),
        });
        return so.id;
      }
      const id = `SO-${String(
        maxNum(
          s.standingOrders.map((x) => x.id),
          /SO-(\d+)/,
        ) + 1,
      ).padStart(3, '0')}`;
      set({ standingOrders: [...s.standingOrders, { ...so, id }] });
      return id;
    },

    addQuoteRequest(q: NewQuoteRequestInput) {
      if (!PRODUCTS.some((p) => p.id === q.productId)) throw notFoundError('Product', q.productId);
      const s = get();
      const id = `RFQ-${String(417 + s.quoteRequests.length + 1).padStart(4, '0')}`;
      set({
        quoteRequests: [{ ...q, id, status: 'Submitted', createdAt: stamp() }, ...s.quoteRequests],
      });
      notify({
        kind: 'lead',
        title: 'New quote request',
        body: `${q.businessName} requested a wholesale quote (${id}).`,
        href: '/orders',
        severity: 'info',
        roles: ['owner', 'sales'],
      });
      return id;
    },
  };
}

export type OpsCommands = ReturnType<typeof createCommands>;
export type OpsCommandName = keyof OpsCommands;
