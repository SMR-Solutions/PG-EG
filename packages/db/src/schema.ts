import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────
// OWNERS
// ─────────────────────────────────────────
export const owners = pgTable("owners", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(), // +91XXXXXXXXXX — single source of truth
  firebaseUid: text("firebase_uid").unique(), // Firebase UID for token verification
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────
// PGS (Property)
// ─────────────────────────────────────────
export const pgs = pgTable("pgs", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => owners.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull().default("gents"), // gents | ladies | co-living
  totalFloors: integer("total_floors").notNull().default(1),
  address: text("address").notNull().default(""),
  locationLink: text("location_link"),
  city: text("city").notNull().default(""),
  totalBeds: integer("total_beds").notNull().default(0),
  sharings: text("sharings").notNull().default("[1]"), // JSON string e.g. "[1,2,3]"
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  rules: text("rules"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────
// ROOMS
// ─────────────────────────────────────────
export const rooms = pgTable("rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  pgId: uuid("pg_id").notNull().references(() => pgs.id, { onDelete: "cascade" }),
  roomNumber: text("room_number").notNull(),
  floor: integer("floor").notNull().default(1),
  sharingType: integer("sharing_type").notNull(), // = number of beds
  rentAmount: integer("rent_amount").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────
// BEDS
// ─────────────────────────────────────────
export const beds = pgTable("beds", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  bedNumber: integer("bed_number").notNull(),
  isOccupied: boolean("is_occupied").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────
// TENANTS
// ─────────────────────────────────────────
export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  pgId: uuid("pg_id")
    .notNull()
    .references(() => pgs.id, { onDelete: "cascade" }),
  bedId: uuid("bed_id").references(() => beds.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  photoUrl: text("photo_url"),
  idPhotoUrl: text("id_photo_url"),
  joiningDate: timestamp("joining_date").notNull(),
  leavingDate: timestamp("leaving_date"),
  rentAmount: integer("rent_amount").notNull(),
  advanceAmount: integer("advance_amount").default(0),
  depositDeduction: integer("deposit_deduction").default(0),
  refundMode: text("refund_mode"), // cash | upi
  status: text("status").notNull().default("active"), // active | inactive
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


// ─────────────────────────────────────────
// RENT PAYMENTS
// ─────────────────────────────────────────
export const rentPayments = pgTable("rent_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  pgId: uuid("pg_id").notNull().references(() => pgs.id, { onDelete: "cascade" }),
  bedId: uuid("bed_id").notNull().references(() => beds.id),
  month: text("month").notNull(), // "2026-09" format
  amount: integer("amount").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | paid
  paymentMode: text("payment_mode"), // cash | upi
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────
// TENANT HISTORY
// ─────────────────────────────────────────
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

// Type exports
export type Owner = typeof owners.$inferSelect;
export type NewOwner = typeof owners.$inferInsert;
export type PG = typeof pgs.$inferSelect;
export type NewPG = typeof pgs.$inferInsert;
export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;
export type Bed = typeof beds.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
