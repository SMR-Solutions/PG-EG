import PDFDocument from "pdfkit";

export interface TenantReportItem {
  id: string;
  name: string;
  phone: string;
  altPhone?: string | null;
  emergencyContact?: string | null;
  emergencyRelation?: string | null;
  floor: number;
  roomNumber: string;
  bedNumber: string | number;
  sharingType: number | string;
  joiningDate: string;
  leavingDate?: string | null;
  status: "active" | "inactive" | string;
  monthlyRent: number;
  paidAmount: number;
  rentStatus: "paid" | "partial" | "pending";
  paymentMode?: string | null;
  advanceAmount: number;
  depositDeduction: number;
  profession?: string | null;
  professionDetail?: string | null;
}

export interface PgReportData {
  pgName: string;
  pgType: string;
  address: string;
  managerName: string;
  managerPhone: string;
  month: string; // e.g. "2026-10"
  monthLabel: string; // e.g. "October 2026"
  totalRent: number;
  collected: number;
  pending: number;
  paidCount: number;
  totalTenants: number;
  tenants: TenantReportItem[];
}

export async function generateTenantReportPDF(data: PgReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 36, // 0.5 inch margins
        info: {
          Title: `${data.pgName} – Tenants & Rent Report (${data.monthLabel})`,
          Author: "PG-EG Management System",
          Subject: "Official Physical Backup Dossier",
        },
      });

      const buffers: Buffer[] = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      const fmtRs = (n: number) => `Rs. ${Number(n || 0).toLocaleString("en-IN")}`;

      // ── Header Box ──
      doc.rect(36, 36, 523, 76).fillAndStroke("#0f172a", "#0f172a");

      doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold").text(data.pgName, 48, 48);
      doc
        .fontSize(9.5)
        .font("Helvetica")
        .fillColor("#94a3b8")
        .text(`${data.pgType.toUpperCase()} PG  ·  OFFICIAL PHYSICAL BACKUP DOSSIER`, 48, 70);
      doc.text(`Address: ${data.address || "—"}`, 48, 83);
      doc.text(`Manager: ${data.managerName || "—"} (${data.managerPhone || "—"})`, 48, 95);

      // Top-Right badge
      doc
        .fontSize(12)
        .font("Helvetica-Bold")
        .fillColor("#10b981")
        .text(data.monthLabel, 400, 50, { align: "right", width: 145 });
      doc
        .fontSize(8.5)
        .font("Helvetica")
        .fillColor("#94a3b8")
        .text(`Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`, 400, 68, { align: "right", width: 145 });
      doc
        .fontSize(8)
        .fillColor("#cbd5e1")
        .text("SAFETY COPY FOR OFFICE REGISTER", 400, 82, { align: "right", width: 145 });

      let y = 124;

      // ── Summary Cards ──
      const cardW = 124;
      const cardH = 46;
      const stats = [
        { label: "TOTAL TENANTS", val: `${data.totalTenants}`, sub: `${data.paidCount} Paid`, color: "#0f172a" },
        { label: "TOTAL RENT", val: fmtRs(data.totalRent), sub: data.monthLabel, color: "#0f172a" },
        { label: "COLLECTED", val: fmtRs(data.collected), sub: `${Math.round((data.collected / (data.totalRent || 1)) * 100)}% Collected`, color: "#16a34a" },
        { label: "PENDING DUES", val: fmtRs(data.pending), sub: data.pending === 0 ? "Fully Cleared" : "Follow-up Required", color: data.pending === 0 ? "#16a34a" : "#dc2626" },
      ];

      stats.forEach((st, i) => {
        const cx = 36 + i * (cardW + 9);
        doc.rect(cx, y, cardW, cardH).lineWidth(1).fillAndStroke("#f8fafc", "#e2e8f0");
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#64748b").text(st.label, cx + 8, y + 6);
        doc.fontSize(12).font("Helvetica-Bold").fillColor(st.color).text(st.val, cx + 8, y + 17);
        doc.fontSize(7.5).font("Helvetica").fillColor("#64748b").text(st.sub, cx + 8, y + 33);
      });

      y += 58;

      // Notice Callout
      doc.rect(36, y, 523, 22).lineWidth(1).fillAndStroke("#f0fdf4", "#bbf7d0");
      doc
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .fillColor("#15803d")
        .text("NOTICE: Please print and file this copy in your PG Office binder for physical verification & safety compliance.", 44, y + 6);

      y += 32;

      // Group tenants by floor
      const floorMap = new Map<number, TenantReportItem[]>();
      data.tenants.forEach((t) => {
        const fl = t.floor || 1;
        if (!floorMap.has(fl)) floorMap.set(fl, []);
        floorMap.get(fl)!.push(t);
      });

      const sortedFloors = Array.from(floorMap.entries()).sort((a, b) => a[0] - b[0]);

      sortedFloors.forEach(([floorNum, floorTenants]) => {
        // Check page overflow
        if (y > 680) {
          doc.addPage();
          y = 36;
        }

        // Floor Section Header
        doc.rect(36, y, 523, 20).fillAndStroke("#1e293b", "#1e293b");
        doc
          .fontSize(9.5)
          .font("Helvetica-Bold")
          .fillColor("#ffffff")
          .text(`FLOOR — ${floorNum}`, 46, y + 5);

        const fTotal = floorTenants.reduce((sum, t) => sum + t.monthlyRent, 0);
        const fPaid = floorTenants.reduce((sum, t) => sum + t.paidAmount, 0);
        doc
          .fontSize(8.5)
          .font("Helvetica")
          .fillColor("#cbd5e1")
          .text(`${floorTenants.length} Tenants  ·  Collected: ${fmtRs(fPaid)} / ${fmtRs(fTotal)}`, 300, y + 5, { align: "right", width: 250 });

        y += 24;

        // Render each tenant
        floorTenants.forEach((t) => {
          if (y > 700) {
            doc.addPage();
            y = 36;
          }

          const cardHeight = 68;
          doc.rect(36, y, 523, cardHeight).lineWidth(0.8).fillAndStroke("#ffffff", "#e2e8f0");

          // Left accent stripe
          const statusColor = t.status === "active" ? "#10b981" : "#94a3b8";
          doc.rect(36, y, 4, cardHeight).fill(statusColor);

          // Tenant Name & Status
          doc.fontSize(11).font("Helvetica-Bold").fillColor("#0f172a").text(t.name, 48, y + 8);
          doc
            .fontSize(8)
            .font("Helvetica-Bold")
            .fillColor(t.status === "active" ? "#16a34a" : "#dc2626")
            .text(`[${t.status === "active" ? "ACTIVE STAYING" : "CHECKED OUT"}]`, 48 + doc.widthOfString(t.name) + 8, y + 9);

          // Detail lines
          doc.fontSize(8).font("Helvetica").fillColor("#64748b");
          doc.text(`Phone: `, 48, y + 25, { continued: true });
          doc.font("Helvetica-Bold").fillColor("#0f172a").text(`+91 ${t.phone}   `, { continued: true });
          doc.font("Helvetica").fillColor("#64748b").text(`Emergency: `, { continued: true });
          doc.font("Helvetica-Bold").fillColor("#0f172a").text(`${t.emergencyContact ? `+91 ${t.emergencyContact} (${t.emergencyRelation || "Rel"})` : "—"}`);

          doc.font("Helvetica").fillColor("#64748b");
          doc.text(`Room: `, 48, y + 38, { continued: true });
          doc.font("Helvetica-Bold").fillColor("#0f172a").text(`Room ${t.roomNumber} · Bed ${t.bedNumber} · ${t.sharingType}-Sharing   `, { continued: true });
          doc.font("Helvetica").fillColor("#64748b").text(`Joined: `, { continued: true });
          doc.font("Helvetica-Bold").fillColor("#0f172a").text(`${t.joiningDate}`);

          doc.font("Helvetica").fillColor("#64748b");
          doc.text(`Profession: `, 48, y + 51, { continued: true });
          doc.font("Helvetica-Bold").fillColor("#0f172a").text(`${t.profession ? `${t.profession}${t.professionDetail ? ` (${t.professionDetail})` : ""}` : "—"}   `, { continued: true });
          doc.font("Helvetica").fillColor("#64748b").text(`Security Deposit: `, { continued: true });
          doc.font("Helvetica-Bold").fillColor("#0f172a").text(`${fmtRs(t.advanceAmount)} ${t.paymentMode ? `(${t.paymentMode.toUpperCase()})` : ""}`);

          // Financial badge block on right
          const rentBadgeBg = t.rentStatus === "paid" ? "#dcfce7" : t.rentStatus === "partial" ? "#fef3c7" : "#fee2e2";
          const rentBadgeText = t.rentStatus === "paid" ? "#16a34a" : t.rentStatus === "partial" ? "#b45309" : "#dc2626";
          const rentLabel = t.rentStatus === "paid" ? "PAID ✓" : t.rentStatus === "partial" ? `DUE: ${fmtRs(t.monthlyRent - t.paidAmount)}` : `DUE: ${fmtRs(t.monthlyRent)}`;

          doc.rect(420, y + 8, 128, 22).fillAndStroke(rentBadgeBg, rentBadgeBg);
          doc.fontSize(9).font("Helvetica-Bold").fillColor(rentBadgeText).text(rentLabel, 420, y + 14, { align: "center", width: 128 });

          doc.fontSize(8).font("Helvetica").fillColor("#64748b").text(`Rent: ${fmtRs(t.monthlyRent)}/mo`, 420, y + 35, { align: "center", width: 128 });
          doc.text(`Paid: ${fmtRs(t.paidAmount)}`, 420, y + 48, { align: "center", width: 128 });

          y += cardHeight + 8;
        });

        y += 6;
      });

      // Bottom Sign-off Box
      if (y > 720) {
        doc.addPage();
        y = 36;
      } else {
        y = Math.max(y + 10, 720);
      }

      doc.rect(36, y, 523, 44).lineWidth(1).fillAndStroke("#ffffff", "#cbd5e1");
      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor("#64748b")
        .text("PG MANAGER / OWNER SIGNATURE & VERIFICATION STAMP", 48, y + 8);
      doc
        .fontSize(7.5)
        .font("Helvetica")
        .fillColor("#94a3b8")
        .text(`Verified by ${data.managerName || "Manager"} · Date: _________________`, 48, y + 26);
      doc
        .fontSize(7.5)
        .font("Helvetica")
        .fillColor("#94a3b8")
        .text("PG-EG Digital Record Security System · www.pgeg.in", 340, y + 26, { align: "right", width: 210 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
