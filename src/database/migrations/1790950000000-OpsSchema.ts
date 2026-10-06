import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TradeLoop operations records (schema `ops`): one table per record type, keyed by organization +
 * readable id (JOB-260925-009, TRIP-260925-01…). `data` holds the whole record; the key columns are
 * extracted from it on write and carry deferred foreign keys, so the records stay relationally
 * consistent (checked at commit, after a command has written all the rows it touched).
 *
 * Also adds the sales, warehouse, procurement and customer roles, and `subject_ref` on memberships:
 * the driver (DRV-…) a DRIVER login drives as, or the customer (CUS-…) a CUSTOMER login orders for.
 */
type Col = [name: string, type: string];
type Fk = [column: string, table: string];
interface Table {
  name: string;
  columns: Col[];
  fks?: Fk[];
  unique?: string[];
}

const TABLES: Table[] = [
  { name: 'trucks', columns: [] },
  { name: 'drivers', columns: [] },
  {
    name: 'customers',
    columns: [
      ['name', 'text'],
      ['status', 'text'],
    ],
  },
  {
    name: 'leads',
    columns: [
      ['stage', 'text'],
      ['converted_customer_id', 'text'],
    ],
    fks: [['converted_customer_id', 'customers']],
  },
  {
    name: 'trips',
    columns: [
      ['status', 'text'],
      ['trip_date', 'date'],
      ['truck_id', 'text'],
      ['driver_id', 'text'],
      ['route_id', 'text'],
    ],
    fks: [
      ['truck_id', 'trucks'],
      ['driver_id', 'drivers'],
    ],
  },
  {
    name: 'quotes',
    columns: [
      ['status', 'text'],
      ['customer_id', 'text'],
      ['lead_id', 'text'],
      ['job_id', 'text'],
    ],
    fks: [
      ['customer_id', 'customers'],
      ['lead_id', 'leads'],
    ],
  },
  {
    name: 'jobs',
    columns: [
      ['status', 'text'],
      ['customer_id', 'text'],
      ['trip_id', 'text'],
      ['quote_id', 'text'],
      ['leg', 'text'],
      ['pickup_at', 'timestamp'],
      ['freight_charge', 'numeric(14,2)'],
    ],
    fks: [
      ['customer_id', 'customers'],
      ['trip_id', 'trips'],
      ['quote_id', 'quotes'],
    ],
  },
  {
    name: 'loads',
    columns: [
      ['status', 'text'],
      ['job_id', 'text'],
      ['trip_id', 'text'],
      ['customer_id', 'text'],
      ['leg', 'text'],
      ['weight_kg', 'numeric(12,2)'],
    ],
    fks: [
      ['job_id', 'jobs'],
      ['trip_id', 'trips'],
      ['customer_id', 'customers'],
    ],
  },
  {
    name: 'deliveries',
    columns: [
      ['status', 'text'],
      ['job_id', 'text'],
      ['trip_id', 'text'],
      ['customer_id', 'text'],
    ],
    fks: [
      ['job_id', 'jobs'],
      ['trip_id', 'trips'],
      ['customer_id', 'customers'],
    ],
  },
  {
    name: 'payments',
    columns: [
      ['job_id', 'text'],
      ['customer_id', 'text'],
      ['invoice_id', 'text'],
      ['amount', 'numeric(14,2)'],
      ['paid_at', 'timestamp'],
    ],
    fks: [
      ['job_id', 'jobs'],
      ['customer_id', 'customers'],
    ],
  },
  {
    name: 'fuel_logs',
    columns: [
      ['truck_id', 'text'],
      ['trip_id', 'text'],
      ['driver_id', 'text'],
      ['logged_at', 'timestamp'],
    ],
    fks: [
      ['truck_id', 'trucks'],
      ['trip_id', 'trips'],
      ['driver_id', 'drivers'],
    ],
  },
  {
    name: 'expenses',
    columns: [
      ['category', 'text'],
      ['amount', 'numeric(14,2)'],
      ['expense_date', 'date'],
      ['trip_id', 'text'],
      ['truck_id', 'text'],
      ['fuel_log_id', 'text'],
    ],
    fks: [
      ['trip_id', 'trips'],
      ['truck_id', 'trucks'],
      ['fuel_log_id', 'fuel_logs'],
    ],
  },
  {
    name: 'maintenance_records',
    columns: [
      ['truck_id', 'text'],
      ['status', 'text'],
      ['service_date', 'date'],
    ],
    fks: [['truck_id', 'trucks']],
  },
  {
    name: 'vehicle_documents',
    columns: [
      ['truck_id', 'text'],
      ['driver_id', 'text'],
      ['expiry_date', 'date'],
    ],
    fks: [
      ['truck_id', 'trucks'],
      ['driver_id', 'drivers'],
    ],
  },
  {
    name: 'notifications',
    columns: [
      ['notified_at', 'timestamp'],
      ['read', 'boolean'],
    ],
  },
  { name: 'trucking_partners', columns: [['name', 'text']] },
  {
    name: 'board_capacity',
    columns: [
      ['status', 'text'],
      ['fleet', 'text'],
      ['trip_id', 'text'],
      ['partner_id', 'text'],
    ],
    fks: [
      ['trip_id', 'trips'],
      ['partner_id', 'trucking_partners'],
    ],
  },
  {
    name: 'board_loads',
    columns: [
      ['status', 'text'],
      ['job_id', 'text'],
      ['capacity_id', 'text'],
      ['partner_id', 'text'],
      ['customer_id', 'text'],
    ],
    fks: [
      ['job_id', 'jobs'],
      ['capacity_id', 'board_capacity'],
      ['partner_id', 'trucking_partners'],
      ['customer_id', 'customers'],
    ],
  },
  {
    name: 'backhaul_listings',
    columns: [
      ['trip_id', 'text'],
      ['status', 'text'],
    ],
    fks: [['trip_id', 'trips']],
    unique: ['trip_id'],
  },
  {
    name: 'backhaul_requests',
    columns: [
      ['listing_id', 'text'],
      ['job_id', 'text'],
      ['customer_id', 'text'],
      ['status', 'text'],
    ],
    fks: [
      ['listing_id', 'backhaul_listings'],
      ['job_id', 'jobs'],
      ['customer_id', 'customers'],
    ],
  },
  {
    name: 'sales_orders',
    columns: [
      ['customer_id', 'text'],
      ['status', 'text'],
      ['delivery_date', 'date'],
    ],
    fks: [['customer_id', 'customers']],
  },
  {
    name: 'purchase_orders',
    columns: [
      ['supplier_id', 'text'],
      ['status', 'text'],
    ],
  },
  {
    name: 'sales_payments',
    columns: [
      ['order_id', 'text'],
      ['customer_id', 'text'],
      ['amount', 'numeric(14,2)'],
    ],
    fks: [
      ['order_id', 'sales_orders'],
      ['customer_id', 'customers'],
    ],
  },
  {
    name: 'inventory_batches',
    columns: [
      ['product_id', 'text'],
      ['po_id', 'text'],
    ],
    fks: [['po_id', 'purchase_orders']],
  },
  {
    name: 'standing_orders',
    columns: [
      ['customer_id', 'text'],
      ['status', 'text'],
    ],
    fks: [['customer_id', 'customers']],
  },
  {
    name: 'quote_requests',
    columns: [
      ['customer_id', 'text'],
      ['status', 'text'],
    ],
    fks: [['customer_id', 'customers']],
  },
];

const NEW_ROLES = ['SALES', 'WAREHOUSE', 'PROCUREMENT', 'CUSTOMER'];

export class OpsSchema1790950000000 implements MigrationInterface {
  name = 'OpsSchema1790950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const role of NEW_ROLES)
      await queryRunner.query(
        `ALTER TYPE "public"."membership_role" ADD VALUE IF NOT EXISTS '${role}'`,
      );
    await queryRunner.query(
      `ALTER TABLE "organization_memberships" ADD "subject_ref" character varying(40)`,
    );

    await queryRunner.query(`CREATE SCHEMA "ops"`);
    await queryRunner.query(
      `CREATE TABLE "ops"."tenants" ("organization_id" uuid NOT NULL, "version" bigint NOT NULL DEFAULT 0, "clock_tick" integer NOT NULL DEFAULT 0, "profile" jsonb NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ops_tenants" PRIMARY KEY ("organization_id"), CONSTRAINT "FK_ops_tenants_organization" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE)`,
    );
    for (const t of TABLES) {
      const cols = t.columns.map(([name, type]) => `, "${name}" ${type}`).join('');
      await queryRunner.query(
        `CREATE TABLE "ops"."${t.name}" ("organization_id" uuid NOT NULL, "id" character varying(40) NOT NULL, "data" jsonb NOT NULL, "sort_key" double precision NOT NULL${cols}, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_ops_${t.name}" PRIMARY KEY ("organization_id", "id"), CONSTRAINT "FK_ops_${t.name}_tenant" FOREIGN KEY ("organization_id") REFERENCES "ops"."tenants"("organization_id") ON DELETE CASCADE)`,
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_ops_${t.name}_order" ON "ops"."${t.name}" ("organization_id", "sort_key")`,
      );
      for (const u of t.unique ?? [])
        await queryRunner.query(
          `CREATE UNIQUE INDEX "UQ_ops_${t.name}_${u}" ON "ops"."${t.name}" ("organization_id", "${u}")`,
        );
    }
    for (const t of TABLES)
      for (const [column, target] of t.fks ?? []) {
        await queryRunner.query(
          `ALTER TABLE "ops"."${t.name}" ADD CONSTRAINT "FK_ops_${t.name}_${column}" FOREIGN KEY ("organization_id", "${column}") REFERENCES "ops"."${target}"("organization_id", "id") DEFERRABLE INITIALLY DEFERRED`,
        );
        await queryRunner.query(
          `CREATE INDEX "IDX_ops_${t.name}_${column}" ON "ops"."${t.name}" ("organization_id", "${column}")`,
        );
      }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA "ops" CASCADE`);
    await queryRunner.query(`ALTER TABLE "organization_memberships" DROP COLUMN "subject_ref"`);
    // Postgres cannot drop enum values; the extra membership roles stay defined but unused.
  }
}
