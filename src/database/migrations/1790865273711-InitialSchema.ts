import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1790865273711 implements MigrationInterface {
  name = 'InitialSchema1790865273711';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "organization_id" uuid, "user_id" uuid, "action" character varying(80) NOT NULL, "entity_type" character varying(60) NOT NULL, "entity_id" character varying(64), "metadata" jsonb NOT NULL DEFAULT '{}', "ip_address" character varying(64), "user_agent" character varying(500), "request_id" character varying(128), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2f68e345c05e8166ff9deea1ab" ON "audit_logs" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7421efc125d95e413657efa3c6" ON "audit_logs" ("entity_type", "entity_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_71fef71b47bf988fa899406acb" ON "audit_logs" ("organization_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying(254) NOT NULL, "password_hash" character varying(255) NOT NULL, "first_name" character varying(100) NOT NULL, "last_name" character varying(100) NOT NULL, "phone" character varying(40), "status" "public"."user_status" NOT NULL DEFAULT 'ACTIVE', "last_login_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."session_revoke_reason" AS ENUM('ROTATED', 'LOGOUT', 'LOGOUT_ALL', 'REUSE_DETECTED', 'SWITCHED_ORGANIZATION', 'PASSWORD_CHANGED', 'EXPIRED', 'ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_sessions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "organization_id" uuid, "family_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "revoked_reason" "public"."session_revoke_reason", "ip_address" character varying(64), "user_agent" character varying(500), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_9190032f6967b7971dca07d69f3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_eb0c40963cccc7058fb8f3a7a7" ON "refresh_sessions" ("expires_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f22ad614014a610b9851827b84" ON "refresh_sessions" ("family_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0abd4ffe21be97f3d327c18d49" ON "refresh_sessions" ("user_id", "revoked_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "number_sequences" ("scope" character varying(64) NOT NULL, "prefix" character varying(8) NOT NULL, "year" integer NOT NULL, "value" bigint NOT NULL DEFAULT '0', CONSTRAINT "PK_b6f353e0605cab90e0f70d464d9" PRIMARY KEY ("scope", "prefix", "year"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."organization_type" AS ENUM('SHIPPER', 'TRUCKING_COMPANY', 'LOGISTICS_PROVIDER', 'BROKER', 'WAREHOUSE', 'PLATFORM_ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."organization_status" AS ENUM('ACTIVE', 'PENDING', 'SUSPENDED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."commission_type" AS ENUM('PERCENTAGE', 'FIXED', 'NONE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(200) NOT NULL, "code" character varying(40) NOT NULL, "type" "public"."organization_type" NOT NULL, "email" character varying(254), "phone" character varying(40), "status" "public"."organization_status" NOT NULL DEFAULT 'ACTIVE', "metadata" jsonb NOT NULL DEFAULT '{}', "commission_type" "public"."commission_type", "commission_value" numeric(12,2), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7e27c3b62c681fbe3e2322535f" ON "organizations" ("code") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_01d4c599774ae14353d413990b" ON "organizations" ("type", "status") `,
    );
    await queryRunner.query(`CREATE TYPE "public"."customer_status" AS ENUM('ACTIVE', 'INACTIVE')`);
    await queryRunner.query(
      `CREATE TABLE "customers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "name" character varying(200) NOT NULL, "company_name" character varying(200), "email" character varying(254), "phone" character varying(40), "tax_id" character varying(40), "billing_address" text, "notes" text, "status" "public"."customer_status" NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "PK_133ec679a801fab5e070f73d3ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8bc5117024ee6c769cbf0e1ced" ON "customers" ("organization_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f6e60fc042b1bcc622ff4a29aa" ON "customers" ("organization_id", "name") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."document_entity_type" AS ENUM('ORDER', 'SHIPMENT', 'LOAD', 'TRIP', 'VEHICLE', 'DRIVER', 'BOOKING')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."document_type" AS ENUM('PROOF_OF_DELIVERY', 'DELIVERY_RECEIPT', 'INVOICE', 'VEHICLE_DOCUMENT', 'DRIVER_DOCUMENT', 'SHIPMENT_ATTACHMENT', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL, "entity_type" "public"."document_entity_type" NOT NULL, "entity_id" uuid NOT NULL, "type" "public"."document_type" NOT NULL, "file_name" character varying(255) NOT NULL, "mime_type" character varying(100) NOT NULL, "size" integer NOT NULL, "storage_key" character varying(500) NOT NULL, "uploaded_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_5bbdbd9b881aa4a7b85e3b574d" ON "documents" ("entity_type", "entity_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_93520376994554223f8845a31f" ON "documents" ("organization_id", "entity_type", "entity_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."driver_status" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "drivers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "user_id" uuid, "first_name" character varying(100) NOT NULL, "last_name" character varying(100) NOT NULL, "phone" character varying(40), "license_number" character varying(40) NOT NULL, "license_expiry" date, "status" "public"."driver_status" NOT NULL DEFAULT 'ACTIVE', "metadata" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_92ab3fb69e566d3eb0cae896047" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_17ca58cf88230ee4b796a188ca" ON "drivers" ("organization_id", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6dc6cff5ac98ff82420daedd88" ON "drivers" ("organization_id", "user_id") WHERE "user_id" IS NOT NULL AND "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_de2821ca3fc06edeba142bd27a" ON "drivers" ("organization_id", "license_number") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."location_type" AS ENUM('WAREHOUSE', 'DEPOT', 'CUSTOMER', 'PICKUP', 'DELIVERY', 'OTHER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "locations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid, "name" character varying(200) NOT NULL, "address_line" character varying(300), "barangay" character varying(120), "city" character varying(120) NOT NULL, "province" character varying(120) NOT NULL, "postal_code" character varying(20), "country" character varying(2) NOT NULL DEFAULT 'PH', "latitude" numeric(9,6) NOT NULL, "longitude" numeric(9,6) NOT NULL, "location" geography(Point,4326) NOT NULL, "type" "public"."location_type" NOT NULL DEFAULT 'OTHER', "deleted_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_7cc1c9e3853b94816c094825e74" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dbf41576612e74b0ec1f698c07" ON "locations" USING GiST ("location") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_534eed06a78611141465d8c539" ON "locations" ("province", "city") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_599bf94fe4010a2e4f49dab3ee" ON "locations" ("organization_id", "type") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_status" AS ENUM('DRAFT', 'CONFIRMED', 'PROCESSING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "customer_id" uuid NOT NULL, "order_number" character varying(32) NOT NULL, "external_reference" character varying(100), "status" "public"."order_status" NOT NULL DEFAULT 'DRAFT', "requested_pickup_at" TIMESTAMP WITH TIME ZONE, "requested_delivery_at" TIMESTAMP WITH TIME ZONE, "notes" text, "created_by" uuid, CONSTRAINT "PK_710e2d4957aa5878dfe94e4ac2f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_97911cce452f843ca8fe8e795c" ON "orders" ("organization_id", "external_reference") WHERE "external_reference" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b04ad890bbcb57fd8faba5827e" ON "orders" ("organization_id", "customer_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8abb2be74c2f0d097c90b5587b" ON "orders" ("organization_id", "status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_84d25fd67d9618d36231818239" ON "orders" ("organization_id", "order_number") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."shipment_status" AS ENUM('PENDING', 'PLANNED', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "shipments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "order_id" uuid, "shipment_number" character varying(32) NOT NULL, "pickup_location_id" uuid NOT NULL, "delivery_location_id" uuid NOT NULL, "pickup_window_start" TIMESTAMP WITH TIME ZONE, "pickup_window_end" TIMESTAMP WITH TIME ZONE, "delivery_window_start" TIMESTAMP WITH TIME ZONE, "delivery_window_end" TIMESTAMP WITH TIME ZONE, "status" "public"."shipment_status" NOT NULL DEFAULT 'PENDING', "cargo_description" text, "special_instructions" text, CONSTRAINT "PK_6deda4532ac542a93eab214b564" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e86fac2a18a75dcb82bfbb23f4" ON "shipments" ("order_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8b2e4dcd0bb124675ec1209506" ON "shipments" ("organization_id", "status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c211ca4f636fa0bbbe61ddf2ca" ON "shipments" ("organization_id", "shipment_number") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."load_status" AS ENUM('PENDING', 'ASSIGNED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "loads" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "shipment_id" uuid, "description" character varying(300) NOT NULL, "cargo_type" character varying(60), "weight_kg" numeric(12,2) NOT NULL, "volume_m3" numeric(10,2), "quantity" integer, "unit" character varying(30), "required_vehicle_type" character varying(40), "temperature_controlled" boolean NOT NULL DEFAULT false, "hazardous" boolean NOT NULL DEFAULT false, "status" "public"."load_status" NOT NULL DEFAULT 'PENDING', CONSTRAINT "PK_c90caf6ef671c1a292bc4b4bc1b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f27c952a54341e35fa2a676a29" ON "loads" ("shipment_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0be70f27af2a8d25f052e73dfa" ON "loads" ("organization_id", "cargo_type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_221abf66fc8a7861ce52c43894" ON "loads" ("organization_id", "status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."posting_visibility" AS ENUM('NETWORK', 'PARTNERS_ONLY', 'PRIVATE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."posting_status" AS ENUM('DRAFT', 'OPEN', 'MATCHED', 'BOOKED', 'EXPIRED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "load_postings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "load_id" uuid, "pickup_location_id" uuid NOT NULL, "delivery_location_id" uuid NOT NULL, "pickup_point" geography(Point,4326) NOT NULL, "delivery_point" geography(Point,4326) NOT NULL, "pickup_from" TIMESTAMP WITH TIME ZONE NOT NULL, "pickup_until" TIMESTAMP WITH TIME ZONE NOT NULL, "weight_kg" numeric(12,2) NOT NULL, "volume_m3" numeric(10,2), "required_vehicle_type" character varying(40), "budget" numeric(14,2), "currency" character varying(3) NOT NULL DEFAULT 'PHP', "visibility" "public"."posting_visibility" NOT NULL DEFAULT 'NETWORK', "status" "public"."posting_status" NOT NULL DEFAULT 'OPEN', "notes" text, "expires_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_a9e1daca23f7af750e819f4a660" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_80afaeb007bab3e06b54590575" ON "load_postings" USING GiST ("pickup_point") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f71cba8dee00996b398fce88ab" ON "load_postings" USING GiST ("delivery_point") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6ca07eba41c4969d429f6fe8e8" ON "load_postings" ("load_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d57df73809a6a826bc94feb9c2" ON "load_postings" ("status", "pickup_from") WHERE "status" IN ('OPEN', 'MATCHED')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ee04146fac77a58371886d2a7e" ON "load_postings" ("organization_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vehicle_status" AS ENUM('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'INACTIVE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vehicles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "plate_number" character varying(20) NOT NULL, "vehicle_type" character varying(40) NOT NULL, "make" character varying(80), "model" character varying(80), "year" integer, "max_weight_kg" numeric(12,2) NOT NULL, "max_volume_m3" numeric(10,2), "status" "public"."vehicle_status" NOT NULL DEFAULT 'AVAILABLE', "gps_device_id" character varying(100), "metadata" jsonb NOT NULL DEFAULT '{}', CONSTRAINT "PK_18d8646b59304dce4af3a9e35b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d412f0ee30f82b52bc83d7b3a1" ON "vehicles" ("organization_id", "vehicle_type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_03da503873d8df11777dc1a7d7" ON "vehicles" ("organization_id", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_0d5e8935aa595468a0b86cf212" ON "vehicles" ("organization_id", "plate_number") WHERE "deleted_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."trip_stop_type" AS ENUM('ORIGIN', 'PICKUP', 'DROPOFF', 'WAYPOINT', 'DESTINATION')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."trip_stop_status" AS ENUM('PENDING', 'ARRIVED', 'DEPARTED', 'SKIPPED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "trip_stops" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "trip_id" uuid NOT NULL, "sequence" integer NOT NULL, "location_id" uuid NOT NULL, "type" "public"."trip_stop_type" NOT NULL, "planned_arrival_at" TIMESTAMP WITH TIME ZONE, "actual_arrival_at" TIMESTAMP WITH TIME ZONE, "planned_departure_at" TIMESTAMP WITH TIME ZONE, "actual_departure_at" TIMESTAMP WITH TIME ZONE, "status" "public"."trip_stop_status" NOT NULL DEFAULT 'PENDING', CONSTRAINT "UQ_42bce8bae8e69fc59dc0851ed30" UNIQUE ("trip_id", "sequence") DEFERRABLE INITIALLY DEFERRED, CONSTRAINT "PK_876633f878970267cb0dc525984" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0d78a7fabaa46d902eb74987d5" ON "trip_stops" ("organization_id", "trip_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."trip_status" AS ENUM('DRAFT', 'OPEN', 'PLANNED', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "trips" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "trip_number" character varying(32) NOT NULL, "vehicle_id" uuid, "driver_id" uuid, "origin_location_id" uuid NOT NULL, "destination_location_id" uuid NOT NULL, "scheduled_departure_at" TIMESTAMP WITH TIME ZONE NOT NULL, "scheduled_arrival_at" TIMESTAMP WITH TIME ZONE, "actual_departure_at" TIMESTAMP WITH TIME ZONE, "actual_arrival_at" TIMESTAMP WITH TIME ZONE, "estimated_arrival_at" TIMESTAMP WITH TIME ZONE, "max_weight_kg" numeric(12,2) NOT NULL, "max_volume_m3" numeric(10,2), "available_weight_kg" numeric(12,2) NOT NULL, "available_volume_m3" numeric(10,2), "status" "public"."trip_status" NOT NULL DEFAULT 'DRAFT', "is_marketplace_visible" boolean NOT NULL DEFAULT false, "notes" text, CONSTRAINT "CHK_b26c4b953a8cf837812a9f8592" CHECK ("available_volume_m3" IS NULL OR "available_volume_m3" >= 0), CONSTRAINT "CHK_df956114e64993e082702331da" CHECK ("available_weight_kg" >= 0 AND "available_weight_kg" <= "max_weight_kg"), CONSTRAINT "PK_f71c231dee9c05a9522f9e840f5" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6106fa4350ffc43b6a39e3ab66" ON "trips" ("driver_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_87ef1e1afba64eeb1c164d26ea" ON "trips" ("vehicle_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6328574cc72959229bd44e58dc" ON "trips" ("organization_id", "status", "scheduled_departure_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_8bf8a90fa52216a91dd52ffa21" ON "trips" ("organization_id", "trip_number") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."pricing_type" AS ENUM('FIXED', 'PER_KG', 'NEGOTIABLE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vehicle_postings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "deleted_at" TIMESTAMP WITH TIME ZONE, "trip_id" uuid, "vehicle_id" uuid, "origin_location_id" uuid NOT NULL, "destination_location_id" uuid NOT NULL, "origin_point" geography(Point,4326) NOT NULL, "destination_point" geography(Point,4326) NOT NULL, "departure_from" TIMESTAMP WITH TIME ZONE NOT NULL, "departure_until" TIMESTAMP WITH TIME ZONE NOT NULL, "available_weight_kg" numeric(12,2) NOT NULL, "available_volume_m3" numeric(10,2), "vehicle_type" character varying(40) NOT NULL, "asking_price" numeric(14,2), "currency" character varying(3) NOT NULL DEFAULT 'PHP', "pricing_type" "public"."pricing_type" NOT NULL DEFAULT 'NEGOTIABLE', "visibility" "public"."posting_visibility" NOT NULL DEFAULT 'NETWORK', "status" "public"."posting_status" NOT NULL DEFAULT 'OPEN', "notes" text, "expires_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_909e381f15445a5bfb62c2508e4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cdbbb92f821cbeda0eb771bbb7" ON "vehicle_postings" USING GiST ("origin_point") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_88306d255dd635da4348385fca" ON "vehicle_postings" USING GiST ("destination_point") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_16acdb78c5a248898f2c4e3586" ON "vehicle_postings" ("trip_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2c203f9c3d652492c6fd157b20" ON "vehicle_postings" ("status", "departure_from") WHERE "status" IN ('OPEN', 'MATCHED')`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f8cb56f5e4222ff19b9adbd59c" ON "vehicle_postings" ("organization_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."offer_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'WITHDRAWN', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "marketplace_offers" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "created_by_organization_id" uuid NOT NULL, "target_organization_id" uuid NOT NULL, "created_by_user_id" uuid, "vehicle_posting_id" uuid, "load_posting_id" uuid, "parent_offer_id" uuid, "amount" numeric(14,2) NOT NULL, "currency" character varying(3) NOT NULL DEFAULT 'PHP', "message" text, "status" "public"."offer_status" NOT NULL DEFAULT 'PENDING', "expires_at" TIMESTAMP WITH TIME ZONE, "responded_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_e3eebba650f30a430b5cd99cbb3" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_6a2e2a115d554b6048d47a9298" ON "marketplace_offers" ("load_posting_id") WHERE "status" = 'ACCEPTED'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_49f884627dd51aa96eead0d0b4" ON "marketplace_offers" ("vehicle_posting_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a89f0a7bd097dde2bbd06d12b2" ON "marketplace_offers" ("load_posting_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_1973c34d0bfafb48920e3c1ed8" ON "marketplace_offers" ("created_by_organization_id", "status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fb30c7508879bf51292cf687fb" ON "marketplace_offers" ("target_organization_id", "status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."booking_status" AS ENUM('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "marketplace_bookings" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "booking_number" character varying(32) NOT NULL, "load_posting_id" uuid NOT NULL, "vehicle_posting_id" uuid, "offer_id" uuid NOT NULL, "shipper_organization_id" uuid NOT NULL, "carrier_organization_id" uuid NOT NULL, "trip_id" uuid NOT NULL, "load_id" uuid NOT NULL, "agreed_amount" numeric(14,2) NOT NULL, "currency" character varying(3) NOT NULL, "platform_commission_type" "public"."commission_type" NOT NULL, "platform_commission_value" numeric(12,2) NOT NULL, "platform_commission_amount" numeric(14,2) NOT NULL, "carrier_net_amount" numeric(14,2) NOT NULL, "status" "public"."booking_status" NOT NULL DEFAULT 'CONFIRMED', "completed_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "cancellation_reason" text, CONSTRAINT "PK_1820ec74ed892e9df3718ca008c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c6f4193e8be26f366d00450105" ON "marketplace_bookings" ("trip_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f983da56f346bcd63206e0e0d3" ON "marketplace_bookings" ("carrier_organization_id", "status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_25f813920add971377dc5bfc36" ON "marketplace_bookings" ("shipper_organization_id", "status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_c1572580ee8c9cde076f36317d" ON "marketplace_bookings" ("load_posting_id") WHERE "status" <> 'CANCELLED'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_cbda42936b730958ae1b68597a" ON "marketplace_bookings" ("booking_number") `,
    );
    await queryRunner.query(
      `CREATE TABLE "marketplace_matches" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "load_posting_id" uuid NOT NULL, "vehicle_posting_id" uuid NOT NULL, "score" smallint NOT NULL, "reasons" jsonb NOT NULL DEFAULT '[]', "pickup_detour_km" numeric(10,2) NOT NULL, "dropoff_detour_km" numeric(10,2) NOT NULL, CONSTRAINT "UQ_031fa1198eaff137e4d6c843c02" UNIQUE ("load_posting_id", "vehicle_posting_id"), CONSTRAINT "PK_be80690c8a848f5d5f3e3d88e00" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dbc2d7d2563176a156c8d9f8fa" ON "marketplace_matches" ("vehicle_posting_id", "score") `,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL, "user_id" uuid NOT NULL, "type" character varying(60) NOT NULL, "title" character varying(200) NOT NULL, "message" text NOT NULL, "data" jsonb NOT NULL DEFAULT '{}', "dedupe_key" character varying(200), "read_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_4e9381a2a744b9af40126ca77a" ON "notifications" ("user_id", "dedupe_key") WHERE "dedupe_key" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_abdefdbdba75d3fe7d6eb01681" ON "notifications" ("user_id", "read_at") WHERE "read_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c2c8cc711ca548efee37533f48" ON "notifications" ("user_id", "organization_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."membership_role" AS ENUM('OWNER', 'ADMIN', 'OPERATIONS_MANAGER', 'DISPATCHER', 'DRIVER_MANAGER', 'DRIVER', 'FINANCE', 'VIEWER', 'PLATFORM_ADMIN')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."membership_status" AS ENUM('ACTIVE', 'INVITED', 'SUSPENDED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "organization_memberships" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role" "public"."membership_role" NOT NULL, "status" "public"."membership_status" NOT NULL DEFAULT 'ACTIVE', CONSTRAINT "UQ_caa73db1b161fa6b3a042290fe7" UNIQUE ("organization_id", "user_id"), CONSTRAINT "PK_cd7be805730a4c778a5f45364af" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cc2d3eb4926bcf7f66fa3ad460" ON "organization_memberships" ("user_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "organization_partnerships" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "partner_organization_id" uuid NOT NULL, CONSTRAINT "UQ_9889506c2122b19d681654bb756" UNIQUE ("organization_id", "partner_organization_id"), CONSTRAINT "PK_8bc0c46712d0d39686fe434f6ed" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8dfa10707e3b88b8a04c853400" ON "organization_partnerships" ("partner_organization_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."location_source" AS ENUM('DRIVER_APP', 'GPS_DEVICE', 'MANUAL', 'INTEGRATION')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vehicle_locations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "organization_id" uuid NOT NULL, "vehicle_id" uuid NOT NULL, "trip_id" uuid, "latitude" numeric(9,6) NOT NULL, "longitude" numeric(9,6) NOT NULL, "location" geography(Point,4326) NOT NULL, "speed_kph" numeric(6,2), "heading" numeric(5,2), "accuracy_meters" numeric(8,2), "recorded_at" TIMESTAMP WITH TIME ZONE NOT NULL, "source" "public"."location_source" NOT NULL DEFAULT 'DRIVER_APP', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_445c39fa5b18b0eb10ea136f5c7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2ee7230e9d5fa7c420029dbb4c" ON "vehicle_locations" USING GiST ("location") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_54164d4b1a4d77c7b0e690d25f" ON "vehicle_locations" ("organization_id", "recorded_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0bd0e6bf2b2e721ae066350a5a" ON "vehicle_locations" ("trip_id", "recorded_at") WHERE "trip_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4ee4d3668e48b8fb622a5651d7" ON "vehicle_locations" ("vehicle_id", "recorded_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."trip_load_status" AS ENUM('ASSIGNED', 'PICKED_UP', 'DELIVERED', 'REMOVED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "trip_loads" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "trip_id" uuid NOT NULL, "load_id" uuid NOT NULL, "pickup_stop_id" uuid NOT NULL, "dropoff_stop_id" uuid NOT NULL, "allocated_weight_kg" numeric(12,2) NOT NULL, "allocated_volume_m3" numeric(10,2), "booking_id" uuid, "status" "public"."trip_load_status" NOT NULL DEFAULT 'ASSIGNED', CONSTRAINT "PK_62b48d450884361744211ac2d76" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ae63cf612f51c7465219b29817" ON "trip_loads" ("trip_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b2972a2dd2af27bce4e39b3b42" ON "trip_loads" ("organization_id", "trip_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_bc71f7d17f979c9caddaa1f938" ON "trip_loads" ("load_id") WHERE "status" <> 'REMOVED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_sessions" ADD CONSTRAINT "FK_a7ab4fd82c654c85b9de53d971a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" ADD CONSTRAINT "FK_d2fc0e42b07d01fafc3fbb2bee3" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_69427761f37533ae7767601a64b" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_b9e28779ec77ff2223e2da41f6d" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD CONSTRAINT "FK_e29422b83b65a47618c3cd5d278" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD CONSTRAINT "FK_8e224f1b8f05ace7cfc7c76d03b" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "locations" ADD CONSTRAINT "FK_e80aa366acb3dbc300e668c3ee2" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_3b13df1eb3b062fd5ed4ebc53bf" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_574a2f0932043d4e4baf188ee05" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" ADD CONSTRAINT "FK_3a2ee35581721926841ca73b317" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" ADD CONSTRAINT "FK_e86fac2a18a75dcb82bfbb23f43" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" ADD CONSTRAINT "FK_a69f17af351b5a88a867efe1b28" FOREIGN KEY ("pickup_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" ADD CONSTRAINT "FK_1ebc8c708e986f1058a68a5d01e" FOREIGN KEY ("delivery_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loads" ADD CONSTRAINT "FK_54ee6e1e4d87cec72ba3a02cee5" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "loads" ADD CONSTRAINT "FK_f27c952a54341e35fa2a676a29d" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "load_postings" ADD CONSTRAINT "FK_cd8d0c5bb60257b3cc58f14a55c" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "load_postings" ADD CONSTRAINT "FK_6ca07eba41c4969d429f6fe8e8d" FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "load_postings" ADD CONSTRAINT "FK_460b05345941100fc3bb8dd8642" FOREIGN KEY ("pickup_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "load_postings" ADD CONSTRAINT "FK_ccca6bad21940416363836657cf" FOREIGN KEY ("delivery_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD CONSTRAINT "FK_f9603f682ee2d499d3abfd50225" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_stops" ADD CONSTRAINT "FK_406865278313637f62a6ad0d9fc" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_stops" ADD CONSTRAINT "FK_5cb5ec6432abdf6f1e1c3a0970c" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_stops" ADD CONSTRAINT "FK_5fded831c1b931ba7fa8e4e4c76" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trips" ADD CONSTRAINT "FK_15fdd7323bb78f9c4464a02782f" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trips" ADD CONSTRAINT "FK_ab4b806373c2ee43946679d572e" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trips" ADD CONSTRAINT "FK_44d36110fb38f45c2f15c946ddb" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trips" ADD CONSTRAINT "FK_e9a2f103f1b86636a675787bf70" FOREIGN KEY ("origin_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trips" ADD CONSTRAINT "FK_b53c3c769280c9b54be89e41ea1" FOREIGN KEY ("destination_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_postings" ADD CONSTRAINT "FK_9305a45a6507f8efd898a9064cf" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_postings" ADD CONSTRAINT "FK_16acdb78c5a248898f2c4e3586a" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_postings" ADD CONSTRAINT "FK_48cf2b70f6daa0467b735fe614b" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_postings" ADD CONSTRAINT "FK_0793303dcbb97a51bfcd15a5da6" FOREIGN KEY ("origin_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_postings" ADD CONSTRAINT "FK_51b863a447649a6ec204a22319e" FOREIGN KEY ("destination_location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_offers" ADD CONSTRAINT "FK_a079993c1061470a1759303ac9a" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_offers" ADD CONSTRAINT "FK_3f84e9d4f051760225ce52432e2" FOREIGN KEY ("created_by_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_offers" ADD CONSTRAINT "FK_acaa11a1bf8adcf0f54e15809af" FOREIGN KEY ("target_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_offers" ADD CONSTRAINT "FK_ed0dd9dad48aa706bfaba1e23c3" FOREIGN KEY ("vehicle_posting_id") REFERENCES "vehicle_postings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_offers" ADD CONSTRAINT "FK_3e40b6c35c9f337dda7f09822db" FOREIGN KEY ("load_posting_id") REFERENCES "load_postings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_offers" ADD CONSTRAINT "FK_04f92309f179c4f0884ef2d8d39" FOREIGN KEY ("parent_offer_id") REFERENCES "marketplace_offers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_bookings" ADD CONSTRAINT "FK_19f3c9a5e94fcbb0bd8e3b332c1" FOREIGN KEY ("load_posting_id") REFERENCES "load_postings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_bookings" ADD CONSTRAINT "FK_ed62520be0f653ce722ff1ecb01" FOREIGN KEY ("vehicle_posting_id") REFERENCES "vehicle_postings"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_bookings" ADD CONSTRAINT "FK_087f964598ac28b181fbc5e7bf2" FOREIGN KEY ("offer_id") REFERENCES "marketplace_offers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_bookings" ADD CONSTRAINT "FK_931a12b6f54a239f7335584460e" FOREIGN KEY ("shipper_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_bookings" ADD CONSTRAINT "FK_e9ba5066df46c47b45afd3bbc14" FOREIGN KEY ("carrier_organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_bookings" ADD CONSTRAINT "FK_c6f4193e8be26f366d004501051" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_bookings" ADD CONSTRAINT "FK_f26df11a92f993ecfd7b4ca7fdf" FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_matches" ADD CONSTRAINT "FK_0573ea7e63bc3c686ed1e5a28c2" FOREIGN KEY ("load_posting_id") REFERENCES "load_postings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_matches" ADD CONSTRAINT "FK_3023131a1a00560c8254e9674e9" FOREIGN KEY ("vehicle_posting_id") REFERENCES "vehicle_postings"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_cb7b1fb018b296f2107e998b2ff" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_9a8a82462cab47c73d25f49261f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_memberships" ADD CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_memberships" ADD CONSTRAINT "FK_5352fc550034d507d6c76dd2901" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_partnerships" ADD CONSTRAINT "FK_3b7338df49c4d0a95eee882029f" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_partnerships" ADD CONSTRAINT "FK_8dfa10707e3b88b8a04c853400a" FOREIGN KEY ("partner_organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_locations" ADD CONSTRAINT "FK_d959697a2fd09f82d7cbbe63061" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_locations" ADD CONSTRAINT "FK_3fcdd7e632bce0883f2f80c9980" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_locations" ADD CONSTRAINT "FK_9d65021099f84794a6865e9b466" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_loads" ADD CONSTRAINT "FK_050073b8377bf667dd6d296d433" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_loads" ADD CONSTRAINT "FK_ee4f035fccafadbb01b9cbd0bd6" FOREIGN KEY ("trip_id") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_loads" ADD CONSTRAINT "FK_8fdc220480fdc8c9a95b08053d2" FOREIGN KEY ("load_id") REFERENCES "loads"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_loads" ADD CONSTRAINT "FK_f7c112f01e14e0bf3e50621831b" FOREIGN KEY ("pickup_stop_id") REFERENCES "trip_stops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_loads" ADD CONSTRAINT "FK_e7f580ceec116a0fc2fc60fa936" FOREIGN KEY ("dropoff_stop_id") REFERENCES "trip_stops"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    // Audit log is append-only: reject UPDATE and DELETE at the database level.
    await queryRunner.query(`CREATE FUNCTION audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END; $$`);
    await queryRunner.query(`CREATE TRIGGER audit_logs_no_update_delete BEFORE UPDATE OR DELETE ON "audit_logs"
            FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS audit_logs_no_update_delete ON "audit_logs"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS audit_logs_immutable()`);
    await queryRunner.query(
      `ALTER TABLE "trip_loads" DROP CONSTRAINT "FK_e7f580ceec116a0fc2fc60fa936"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_loads" DROP CONSTRAINT "FK_f7c112f01e14e0bf3e50621831b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_loads" DROP CONSTRAINT "FK_8fdc220480fdc8c9a95b08053d2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_loads" DROP CONSTRAINT "FK_ee4f035fccafadbb01b9cbd0bd6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_loads" DROP CONSTRAINT "FK_050073b8377bf667dd6d296d433"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_locations" DROP CONSTRAINT "FK_9d65021099f84794a6865e9b466"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_locations" DROP CONSTRAINT "FK_3fcdd7e632bce0883f2f80c9980"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_locations" DROP CONSTRAINT "FK_d959697a2fd09f82d7cbbe63061"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_partnerships" DROP CONSTRAINT "FK_8dfa10707e3b88b8a04c853400a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_partnerships" DROP CONSTRAINT "FK_3b7338df49c4d0a95eee882029f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_memberships" DROP CONSTRAINT "FK_5352fc550034d507d6c76dd2901"`,
    );
    await queryRunner.query(
      `ALTER TABLE "organization_memberships" DROP CONSTRAINT "FK_86ae2efbb9ce84dd652e0c96a49"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_9a8a82462cab47c73d25f49261f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_cb7b1fb018b296f2107e998b2ff"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_matches" DROP CONSTRAINT "FK_3023131a1a00560c8254e9674e9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_matches" DROP CONSTRAINT "FK_0573ea7e63bc3c686ed1e5a28c2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_bookings" DROP CONSTRAINT "FK_f26df11a92f993ecfd7b4ca7fdf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_bookings" DROP CONSTRAINT "FK_c6f4193e8be26f366d004501051"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_bookings" DROP CONSTRAINT "FK_e9ba5066df46c47b45afd3bbc14"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_bookings" DROP CONSTRAINT "FK_931a12b6f54a239f7335584460e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_bookings" DROP CONSTRAINT "FK_087f964598ac28b181fbc5e7bf2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_bookings" DROP CONSTRAINT "FK_ed62520be0f653ce722ff1ecb01"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_bookings" DROP CONSTRAINT "FK_19f3c9a5e94fcbb0bd8e3b332c1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_offers" DROP CONSTRAINT "FK_04f92309f179c4f0884ef2d8d39"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_offers" DROP CONSTRAINT "FK_3e40b6c35c9f337dda7f09822db"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_offers" DROP CONSTRAINT "FK_ed0dd9dad48aa706bfaba1e23c3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_offers" DROP CONSTRAINT "FK_acaa11a1bf8adcf0f54e15809af"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_offers" DROP CONSTRAINT "FK_3f84e9d4f051760225ce52432e2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "marketplace_offers" DROP CONSTRAINT "FK_a079993c1061470a1759303ac9a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_postings" DROP CONSTRAINT "FK_51b863a447649a6ec204a22319e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_postings" DROP CONSTRAINT "FK_0793303dcbb97a51bfcd15a5da6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_postings" DROP CONSTRAINT "FK_48cf2b70f6daa0467b735fe614b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_postings" DROP CONSTRAINT "FK_16acdb78c5a248898f2c4e3586a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicle_postings" DROP CONSTRAINT "FK_9305a45a6507f8efd898a9064cf"`,
    );
    await queryRunner.query(`ALTER TABLE "trips" DROP CONSTRAINT "FK_b53c3c769280c9b54be89e41ea1"`);
    await queryRunner.query(`ALTER TABLE "trips" DROP CONSTRAINT "FK_e9a2f103f1b86636a675787bf70"`);
    await queryRunner.query(`ALTER TABLE "trips" DROP CONSTRAINT "FK_44d36110fb38f45c2f15c946ddb"`);
    await queryRunner.query(`ALTER TABLE "trips" DROP CONSTRAINT "FK_ab4b806373c2ee43946679d572e"`);
    await queryRunner.query(`ALTER TABLE "trips" DROP CONSTRAINT "FK_15fdd7323bb78f9c4464a02782f"`);
    await queryRunner.query(
      `ALTER TABLE "trip_stops" DROP CONSTRAINT "FK_5fded831c1b931ba7fa8e4e4c76"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_stops" DROP CONSTRAINT "FK_5cb5ec6432abdf6f1e1c3a0970c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "trip_stops" DROP CONSTRAINT "FK_406865278313637f62a6ad0d9fc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" DROP CONSTRAINT "FK_f9603f682ee2d499d3abfd50225"`,
    );
    await queryRunner.query(
      `ALTER TABLE "load_postings" DROP CONSTRAINT "FK_ccca6bad21940416363836657cf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "load_postings" DROP CONSTRAINT "FK_460b05345941100fc3bb8dd8642"`,
    );
    await queryRunner.query(
      `ALTER TABLE "load_postings" DROP CONSTRAINT "FK_6ca07eba41c4969d429f6fe8e8d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "load_postings" DROP CONSTRAINT "FK_cd8d0c5bb60257b3cc58f14a55c"`,
    );
    await queryRunner.query(`ALTER TABLE "loads" DROP CONSTRAINT "FK_f27c952a54341e35fa2a676a29d"`);
    await queryRunner.query(`ALTER TABLE "loads" DROP CONSTRAINT "FK_54ee6e1e4d87cec72ba3a02cee5"`);
    await queryRunner.query(
      `ALTER TABLE "shipments" DROP CONSTRAINT "FK_1ebc8c708e986f1058a68a5d01e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" DROP CONSTRAINT "FK_a69f17af351b5a88a867efe1b28"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" DROP CONSTRAINT "FK_e86fac2a18a75dcb82bfbb23f43"`,
    );
    await queryRunner.query(
      `ALTER TABLE "shipments" DROP CONSTRAINT "FK_3a2ee35581721926841ca73b317"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_574a2f0932043d4e4baf188ee05"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_772d0ce0473ac2ccfa26060dbe9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_3b13df1eb3b062fd5ed4ebc53bf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "locations" DROP CONSTRAINT "FK_e80aa366acb3dbc300e668c3ee2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" DROP CONSTRAINT "FK_8e224f1b8f05ace7cfc7c76d03b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" DROP CONSTRAINT "FK_e29422b83b65a47618c3cd5d278"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_b9e28779ec77ff2223e2da41f6d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_69427761f37533ae7767601a64b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "customers" DROP CONSTRAINT "FK_d2fc0e42b07d01fafc3fbb2bee3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_sessions" DROP CONSTRAINT "FK_a7ab4fd82c654c85b9de53d971a"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_bc71f7d17f979c9caddaa1f938"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b2972a2dd2af27bce4e39b3b42"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ae63cf612f51c7465219b29817"`);
    await queryRunner.query(`DROP TABLE "trip_loads"`);
    await queryRunner.query(`DROP TYPE "public"."trip_load_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4ee4d3668e48b8fb622a5651d7"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0bd0e6bf2b2e721ae066350a5a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_54164d4b1a4d77c7b0e690d25f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2ee7230e9d5fa7c420029dbb4c"`);
    await queryRunner.query(`DROP TABLE "vehicle_locations"`);
    await queryRunner.query(`DROP TYPE "public"."location_source"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8dfa10707e3b88b8a04c853400"`);
    await queryRunner.query(`DROP TABLE "organization_partnerships"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cc2d3eb4926bcf7f66fa3ad460"`);
    await queryRunner.query(`DROP TABLE "organization_memberships"`);
    await queryRunner.query(`DROP TYPE "public"."membership_status"`);
    await queryRunner.query(`DROP TYPE "public"."membership_role"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c2c8cc711ca548efee37533f48"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_abdefdbdba75d3fe7d6eb01681"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_4e9381a2a744b9af40126ca77a"`);
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_dbc2d7d2563176a156c8d9f8fa"`);
    await queryRunner.query(`DROP TABLE "marketplace_matches"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cbda42936b730958ae1b68597a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c1572580ee8c9cde076f36317d"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_25f813920add971377dc5bfc36"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f983da56f346bcd63206e0e0d3"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c6f4193e8be26f366d00450105"`);
    await queryRunner.query(`DROP TABLE "marketplace_bookings"`);
    await queryRunner.query(`DROP TYPE "public"."booking_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_fb30c7508879bf51292cf687fb"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_1973c34d0bfafb48920e3c1ed8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_a89f0a7bd097dde2bbd06d12b2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_49f884627dd51aa96eead0d0b4"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6a2e2a115d554b6048d47a9298"`);
    await queryRunner.query(`DROP TABLE "marketplace_offers"`);
    await queryRunner.query(`DROP TYPE "public"."offer_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f8cb56f5e4222ff19b9adbd59c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2c203f9c3d652492c6fd157b20"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_16acdb78c5a248898f2c4e3586"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_88306d255dd635da4348385fca"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_cdbbb92f821cbeda0eb771bbb7"`);
    await queryRunner.query(`DROP TABLE "vehicle_postings"`);
    await queryRunner.query(`DROP TYPE "public"."pricing_type"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8bf8a90fa52216a91dd52ffa21"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6328574cc72959229bd44e58dc"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_87ef1e1afba64eeb1c164d26ea"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6106fa4350ffc43b6a39e3ab66"`);
    await queryRunner.query(`DROP TABLE "trips"`);
    await queryRunner.query(`DROP TYPE "public"."trip_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0d78a7fabaa46d902eb74987d5"`);
    await queryRunner.query(`DROP TABLE "trip_stops"`);
    await queryRunner.query(`DROP TYPE "public"."trip_stop_status"`);
    await queryRunner.query(`DROP TYPE "public"."trip_stop_type"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0d5e8935aa595468a0b86cf212"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_03da503873d8df11777dc1a7d7"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d412f0ee30f82b52bc83d7b3a1"`);
    await queryRunner.query(`DROP TABLE "vehicles"`);
    await queryRunner.query(`DROP TYPE "public"."vehicle_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ee04146fac77a58371886d2a7e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_d57df73809a6a826bc94feb9c2"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6ca07eba41c4969d429f6fe8e8"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f71cba8dee00996b398fce88ab"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_80afaeb007bab3e06b54590575"`);
    await queryRunner.query(`DROP TABLE "load_postings"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_221abf66fc8a7861ce52c43894"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0be70f27af2a8d25f052e73dfa"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f27c952a54341e35fa2a676a29"`);
    await queryRunner.query(`DROP TABLE "loads"`);
    await queryRunner.query(`DROP TYPE "public"."load_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_c211ca4f636fa0bbbe61ddf2ca"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8b2e4dcd0bb124675ec1209506"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_e86fac2a18a75dcb82bfbb23f4"`);
    await queryRunner.query(`DROP TABLE "shipments"`);
    await queryRunner.query(`DROP TYPE "public"."shipment_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_84d25fd67d9618d36231818239"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8abb2be74c2f0d097c90b5587b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_b04ad890bbcb57fd8faba5827e"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_97911cce452f843ca8fe8e795c"`);
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "public"."order_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_599bf94fe4010a2e4f49dab3ee"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_534eed06a78611141465d8c539"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_dbf41576612e74b0ec1f698c07"`);
    await queryRunner.query(`DROP TABLE "locations"`);
    await queryRunner.query(`DROP TYPE "public"."location_type"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_de2821ca3fc06edeba142bd27a"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_6dc6cff5ac98ff82420daedd88"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_17ca58cf88230ee4b796a188ca"`);
    await queryRunner.query(`DROP TABLE "drivers"`);
    await queryRunner.query(`DROP TYPE "public"."driver_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_93520376994554223f8845a31f"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_5bbdbd9b881aa4a7b85e3b574d"`);
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(`DROP TYPE "public"."document_type"`);
    await queryRunner.query(`DROP TYPE "public"."document_entity_type"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f6e60fc042b1bcc622ff4a29aa"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_8bc5117024ee6c769cbf0e1ced"`);
    await queryRunner.query(`DROP TABLE "customers"`);
    await queryRunner.query(`DROP TYPE "public"."customer_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_01d4c599774ae14353d413990b"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7e27c3b62c681fbe3e2322535f"`);
    await queryRunner.query(`DROP TABLE "organizations"`);
    await queryRunner.query(`DROP TYPE "public"."organization_status"`);
    await queryRunner.query(`DROP TYPE "public"."organization_type"`);
    await queryRunner.query(`DROP TABLE "number_sequences"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_0abd4ffe21be97f3d327c18d49"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_f22ad614014a610b9851827b84"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_eb0c40963cccc7058fb8f3a7a7"`);
    await queryRunner.query(`DROP TABLE "refresh_sessions"`);
    await queryRunner.query(`DROP TYPE "public"."session_revoke_reason"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."user_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_71fef71b47bf988fa899406acb"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_7421efc125d95e413657efa3c6"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_2f68e345c05e8166ff9deea1ab"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "public"."posting_visibility"`);
    await queryRunner.query(`DROP TYPE "public"."posting_status"`);
    await queryRunner.query(`DROP TYPE "public"."commission_type"`);
  }
}
