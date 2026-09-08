import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

// ─── Schema ───────────────────────────────
export const owners = pgTable("owners", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  firebaseUid: text("firebase_uid").unique(),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const pgs = pgTable("pgs", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id").notNull().references(() => owners.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("gents"),
  totalFloors: integer("total_floors").notNull().default(1),
  address: text("address").notNull().default(""),
  locationLink: text("location_link"),
  city: text("city").notNull().default(""),
  totalBeds: integer("total_beds").notNull().default(0),
  sharings: text("sharings").notNull().default("[1]"),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  rules: text("rules"),
  // Per-PG manager contact — can differ from the Google account holder
  managerName: text("manager_name"),
  managerPhone: text("manager_phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const rooms = pgTable("rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  pgId: uuid("pg_id").notNull().references(() => pgs.id, { onDelete: "cascade" }),
  roomNumber: text("room_number").notNull(),
  floor: integer("floor").notNull().default(1),
  sharingType: integer("sharing_type").notNull(),
  rentAmount: integer("rent_amount").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const beds = pgTable("beds", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id").notNull().references(() => rooms.id, { onDelete: "cascade" }),
  bedNumber: integer("bed_number").notNull(),
  isOccupied: boolean("is_occupied").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  pgId: uuid("pg_id").notNull().references(() => pgs.id, { onDelete: "cascade" }),
  bedId: uuid("bed_id").references(() => beds.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  altPhone: text("alt_phone"),                       // optional alternate number
  emergencyContact: text("emergency_contact"),        // emergency contact number
  emergencyRelation: text("emergency_relation"),      // Father | Mother | Friend | Other
  email: text("email"),
  photoUrl: text("photo_url"),
  idPhotoUrl: text("id_photo_url"),
  joiningDate: timestamp("joining_date").notNull(),
  leavingDate: timestamp("leaving_date"),
  rentAmount: integer("rent_amount").notNull(),
  advanceAmount: integer("advance_amount").default(0),
  paymentMode: text("payment_mode"),                  // cash | upi (for deposit)
  depositDeduction: integer("deposit_deduction").default(0),
  refundMode: text("refund_mode"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rentPayments = pgTable("rent_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  pgId: uuid("pg_id").notNull().references(() => pgs.id, { onDelete: "cascade" }),
  bedId: uuid("bed_id").notNull().references(() => beds.id),
  month: text("month").notNull(),                     // "2026-09"
  amount: integer("amount").notNull().default(0),     // full rent due
  paidAmount: integer("paid_amount").notNull().default(0), // cumulative paid so far
  status: text("status").notNull().default("pending"), // pending | partial | paid
  paymentMode: text("payment_mode"),                  // last payment mode
  paidAt: timestamp("paid_at"),                       // when fully paid
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Individual payment transactions for a rent record (supports partial payments)
export const rentPaymentTransactions = pgTable("rent_payment_transactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  rentPaymentId: uuid("rent_payment_id").notNull().references(() => rentPayments.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  pgId: uuid("pg_id").notNull().references(() => pgs.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  paymentMode: text("payment_mode").notNull().default("cash"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tenantHistory = pgTable("tenant_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(), // check_in | move | check_out
  fromBedId: uuid("from_bed_id"),
  fromRoom: text("from_room"),
  toBedId: uuid("to_bed_id"),
  toRoom: text("to_room"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Types ────────────────────────────────
export type Owner = typeof owners.$inferSelect;
export type NewOwner = typeof owners.$inferInsert;
export type PG = typeof pgs.$inferSelect;
export type NewPG = typeof pgs.$inferInsert;

// ─── DB Client ────────────────────────────
const schema = { owners, pgs, rooms, beds, tenants, rentPayments, rentPaymentTransactions, tenantHistory };

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}
