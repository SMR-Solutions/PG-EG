import { eq, and } from "drizzle-orm";
import { createDb, pgs, owners, tenants, rooms, beds, rentPayments } from "../db";
import { PgReportData, TenantReportItem, generateTenantReportPDF } from "./pdfReportGenerator";
import { sendMonthlyTenantReport, MailerResult } from "./mailer";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function formatMonthLabel(monthStr: string): string {
  const [yr, mo] = monthStr.split("-");
  const mIndex = parseInt(mo, 10) - 1;
  return `${MONTHS[mIndex] || monthStr} ${yr}`;
}

export function getCurrentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function fetchPgReportData(pgId: string, monthStr?: string): Promise<{
  reportData: PgReportData;
  ownerEmail: string;
  ownerName: string;
} | null> {
  const db = createDb(process.env.DATABASE_URL!);
  const month = monthStr || getCurrentMonthStr();
  const monthLabel = formatMonthLabel(month);

  const [pg] = await db.select().from(pgs).where(eq(pgs.id, pgId)).limit(1);
  if (!pg) return null;

  const [owner] = await db.select().from(owners).where(eq(owners.id, pg.ownerId)).limit(1);
  if (!owner) return null;

  // Fetch rent payments joined with tenants, beds, rooms
  const payments = await db
    .select({
      id: rentPayments.id,
      tenantId: rentPayments.tenantId,
      bedId: rentPayments.bedId,
      month: rentPayments.month,
      amount: rentPayments.amount,
      paidAmount: rentPayments.paidAmount,
      status: rentPayments.status,
      paymentMode: rentPayments.paymentMode,
      paidAt: rentPayments.paidAt,
      // tenant
      tenantName: tenants.name,
      tenantPhone: tenants.phone,
      tenantAltPhone: tenants.altPhone,
      tenantEmergency: tenants.emergencyContact,
      tenantEmergencyRel: tenants.emergencyRelation,
      tenantStatus: tenants.status,
      tenantJoiningDate: tenants.joiningDate,
      tenantLeavingDate: tenants.leavingDate,
      tenantAdvance: tenants.advanceAmount,
      tenantDepositDeduction: tenants.depositDeduction,
      tenantProfession: tenants.profession,
      tenantProfDetail: tenants.professionDetail,
      tenantPhoto: tenants.photoUrl,
      tenantIdPhoto: tenants.idPhotoUrl,
      // room / bed
      roomNumber: rooms.roomNumber,
      floor: rooms.floor,
      bedNumber: beds.bedNumber,
      sharingType: rooms.sharingType,
    })
    .from(rentPayments)
    .leftJoin(tenants, eq(rentPayments.tenantId, tenants.id))
    .leftJoin(beds, eq(rentPayments.bedId, beds.id))
    .leftJoin(rooms, eq(beds.roomId, rooms.id))
    .where(and(eq(rentPayments.pgId, pgId), eq(rentPayments.month, month)));

  // Also fetch all active tenants in case rent records weren't generated for some
  const allPgTenants = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      phone: tenants.phone,
      altPhone: tenants.altPhone,
      emergencyContact: tenants.emergencyContact,
      emergencyRelation: tenants.emergencyRelation,
      status: tenants.status,
      joiningDate: tenants.joiningDate,
      leavingDate: tenants.leavingDate,
      advanceAmount: tenants.advanceAmount,
      depositDeduction: tenants.depositDeduction,
      paymentMode: tenants.paymentMode,
      rentAmount: tenants.rentAmount,
      profession: tenants.profession,
      professionDetail: tenants.professionDetail,
      photoUrl: tenants.photoUrl,
      idPhotoUrl: tenants.idPhotoUrl,
      bedId: tenants.bedId,
    })
    .from(tenants)
    .where(eq(tenants.pgId, pgId));

  const items: TenantReportItem[] = [];
  const processedTenantIds = new Set<string>();

  for (const p of payments) {
    if (!p.tenantId) continue;
    processedTenantIds.add(p.tenantId);

    const fmtDate = (d: any) =>
      d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

    items.push({
      id: p.tenantId,
      name: p.tenantName || "Unknown Tenant",
      phone: p.tenantPhone || "—",
      altPhone: p.tenantAltPhone || null,
      emergencyContact: p.tenantEmergency || null,
      emergencyRelation: p.tenantEmergencyRel || null,
      floor: p.floor || 1,
      roomNumber: p.roomNumber || "—",
      bedNumber: p.bedNumber || "—",
      sharingType: p.sharingType || 1,
      joiningDate: fmtDate(p.tenantJoiningDate),
      leavingDate: p.tenantLeavingDate ? fmtDate(p.tenantLeavingDate) : null,
      status: p.tenantStatus || "active",
      monthlyRent: p.amount || 0,
      paidAmount: p.paidAmount || 0,
      rentStatus: (p.status as "paid" | "partial" | "pending") || "pending",
      paymentMode: p.paymentMode || null,
      advanceAmount: p.tenantAdvance || 0,
      depositDeduction: p.tenantDepositDeduction || 0,
      profession: p.tenantProfession || null,
      professionDetail: p.tenantProfDetail || null,
      photoUrl: p.tenantPhoto || null,
      idPhotoUrl: p.tenantIdPhoto || null,
    });
  }

  // Include any active tenants not in rentPayments
  for (const t of allPgTenants) {
    if (processedTenantIds.has(t.id)) continue;
    if (t.status !== "active") continue;

    let floor = 1;
    let roomNum = "—";
    let bedNum = "—";
    let sharing = 1;

    if (t.bedId) {
      const [b] = await db.select().from(beds).where(eq(beds.id, t.bedId)).limit(1);
      if (b) {
        bedNum = String(b.bedNumber);
        const [r] = await db.select().from(rooms).where(eq(rooms.id, b.roomId)).limit(1);
        if (r) {
          floor = r.floor || 1;
          roomNum = r.roomNumber || "—";
          sharing = r.sharingType || 1;
        }
      }
    }

    const fmtDate = (d: any) =>
      d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

    items.push({
      id: t.id,
      name: t.name,
      phone: t.phone,
      altPhone: t.altPhone,
      emergencyContact: t.emergencyContact,
      emergencyRelation: t.emergencyRelation,
      floor,
      roomNumber: roomNum,
      bedNumber: bedNum,
      sharingType: sharing,
      joiningDate: fmtDate(t.joiningDate),
      leavingDate: t.leavingDate ? fmtDate(t.leavingDate) : null,
      status: t.status,
      monthlyRent: t.rentAmount || 0,
      paidAmount: 0,
      rentStatus: "pending",
      paymentMode: t.paymentMode,
      advanceAmount: t.advanceAmount || 0,
      depositDeduction: t.depositDeduction || 0,
      profession: t.profession,
      professionDetail: t.professionDetail,
      photoUrl: t.photoUrl || null,
      idPhotoUrl: t.idPhotoUrl || null,
    });
  }

  const totalRent = items.reduce((acc, it) => acc + it.monthlyRent, 0);
  const collected = items.reduce((acc, it) => acc + it.paidAmount, 0);
  const pending = Math.max(0, totalRent - collected);
  const paidCount = items.filter((it) => it.rentStatus === "paid").length;

  const reportData: PgReportData = {
    pgName: pg.name,
    pgType: pg.type || "Co-living",
    address: pg.address || "",
    managerName: pg.managerName || owner.name || "PG Manager",
    managerPhone: pg.managerPhone || owner.phone || "",
    month,
    monthLabel,
    totalRent,
    collected,
    pending,
    paidCount,
    totalTenants: items.length,
    tenants: items,
  };

  return {
    reportData,
    ownerEmail: owner.email || "",
    ownerName: owner.name,
  };
}

export async function sendPgMonthlyReportEmail(pgId: string, monthStr?: string): Promise<MailerResult & { email: string }> {
  const result = await fetchPgReportData(pgId, monthStr);
  if (!result) {
    throw new Error("PG or Owner record not found");
  }

  const { reportData, ownerEmail, ownerName } = result;
  if (!ownerEmail) {
    throw new Error(`Owner for PG ${reportData.pgName} does not have an email address configured.`);
  }

  const pdfBuffer = await generateTenantReportPDF(reportData);

  const mailResult = await sendMonthlyTenantReport({
    to: ownerEmail,
    ownerName,
    pgName: reportData.pgName,
    monthLabel: reportData.monthLabel,
    reportData,
    pdfBuffer,
  });

  return {
    ...mailResult,
    email: ownerEmail,
  };
}

