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
  photoUrl?: string | null;
  idPhotoUrl?: string | null;
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

async function fetchImageBuffer(url?: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const fetchUrl = url.includes("ik.imagekit.io")
      ? `${url}${url.includes("?") ? "&" : "?"}tr=f-jpg,w-200,q-85`
      : url;
    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (
      (buf[0] === 0xff && buf[1] === 0xd8) ||
      (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    ) {
      return buf;
    }
    return null;
  } catch {
    return null;
  }
}

export async function generateTenantReportPDF(data: PgReportData): Promise<Buffer> {
  // Pre-fetch all tenant images in parallel
  const imagesMap = new Map<string, { photo: Buffer | null; id: Buffer | null }>();
  await Promise.all(
    data.tenants.map(async (t) => {
      const [photo, id] = await Promise.all([
        fetchImageBuffer(t.photoUrl),
        fetchImageBuffer(t.idPhotoUrl),
      ]);
      imagesMap.set(t.id, { photo, id });
    })
  );

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 36,
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

      const fmtRs = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

      // ── Top Header Box ──
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
        // Check page overflow for floor header
        if (y > 690) {
          doc.addPage();
          y = 36;
        }

        // Floor Heading Bar (exact look as screenshot: #1a1a2e rounded)
        doc.roundedRect(36, y, 523, 24, 6).fill("#1a1a2e");

        doc
          .fontSize(11)
          .font("Helvetica-Bold")
          .fillColor("#ffffff")
          .text(`Floor — ${floorNum}`, 48, y + 6);

        const fTotal = floorTenants.reduce((sum, t) => sum + t.monthlyRent, 0);
        const fPaid = floorTenants.reduce((sum, t) => sum + t.paidAmount, 0);
        const fPaidCount = floorTenants.filter((t) => t.rentStatus === "paid").length;

        doc
          .fontSize(9)
          .font("Helvetica")
          .fillColor("#a0aec0")
          .text(
            `${floorTenants.length} tenants · Collected `,
            250,
            y + 6,
            { continued: true, width: 295, align: "right" }
          );
        doc
          .font("Helvetica-Bold")
          .fillColor("#68d391")
          .text(fmtRs(fPaid), { continued: true });
        doc
          .font("Helvetica")
          .fillColor("#a0aec0")
          .text(` / ${fmtRs(fTotal)} · ${fPaidCount}/${floorTenants.length} paid`);

        y += 32;

        // Render each tenant card
        floorTenants.forEach((t) => {
          const cardHeight = 114;
          if (y + cardHeight > 740) {
            doc.addPage();
            y = 36;
          }

          const imgs = imagesMap.get(t.id);

          // Card Outer Box
          doc.roundedRect(36, y, 523, cardHeight, 8).lineWidth(1).fillAndStroke("#ffffff", "#e5e7eb");

          // ── Left Column: Photos ──
          if (imgs?.photo) {
            doc.save();
            doc.roundedRect(46, y + 10, 56, 54, 6).clip();
            doc.image(imgs.photo, 46, y + 10, { width: 56, height: 54, fit: [56, 54] });
            doc.restore();
            doc.roundedRect(46, y + 10, 56, 54, 6).lineWidth(0.8).strokeColor("#e5e7eb").stroke();
          } else {
            doc.roundedRect(46, y + 10, 56, 54, 6).fill("#d1fae5");
            doc.fontSize(22).font("Helvetica-Bold").fillColor("#16a34a").text(t.name[0]?.toUpperCase() || "?", 46, y + 26, { width: 56, align: "center" });
          }

          // ID Proof Thumbnail
          if (imgs?.id) {
            doc.fontSize(6).font("Helvetica-Bold").fillColor("#888888").text("ID PROOF", 46, y + 68, { width: 56, align: "center" });
            doc.save();
            doc.roundedRect(46, y + 76, 56, 28, 4).clip();
            doc.image(imgs.id, 46, y + 76, { width: 56, height: 28, fit: [56, 28] });
            doc.restore();
            doc.roundedRect(46, y + 76, 56, 28, 4).lineWidth(0.8).strokeColor("#e5e7eb").stroke();
          }

          // ── Right Column: Info Block ──
          // Top Line: Tenant Name & Status
          doc.fontSize(12.5).font("Helvetica-Bold").fillColor("#111111").text(t.name, 114, y + 10);
          const nameW = doc.widthOfString(t.name);
          const pillX = 114 + nameW + 10;
          const isActive = t.status === "active";
          const statusText = isActive ? "● Active" : `● Checked out ${t.leavingDate || "07 Oct 2026"}`;
          const pillW = doc.widthOfString(statusText) + 12;

          doc.roundedRect(pillX, y + 9, pillW, 14, 7).fill(isActive ? "#dcfce7" : "#fee2e2");
          doc.fontSize(7.5).font("Helvetica-Bold").fillColor(isActive ? "#16a34a" : "#dc2626").text(statusText, pillX + 6, y + 12);

          // 3-Column Metadata Grid
          // Col 1 (x = 114, width = 138)
          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("PHONE", 114, y + 27);
          doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#111111").text(t.phone || "—", 114, y + 35);

          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("JOINING DATE", 114, y + 46);
          doc.fontSize(8.5).font("Helvetica").fillColor("#111111").text(t.joiningDate || "—", 114, y + 54);

          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("ADVANCE / DEPOSIT", 114, y + 65);
          doc.fontSize(8).font("Helvetica-Bold").fillColor("#111111").text(fmtRs(t.advanceAmount), 114, y + 73, { continued: true });
          doc.font("Helvetica").fillColor("#666666").text(` paid on ${t.joiningDate || "—"}`);

          // Col 2 (x = 256, width = 138)
          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("ALT PHONE", 256, y + 27);
          doc.fontSize(8.5).font("Helvetica").fillColor("#111111").text(t.altPhone || "—", 256, y + 35);

          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("FLOOR · ROOM · BED", 256, y + 46);
          doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#111111").text(`FL ${t.floor} · ${t.roomNumber} · Bed ${t.bedNumber}`, 256, y + 54);

          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("DEPOSIT DEDUCTED", 256, y + 65);
          doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#111111").text(fmtRs(t.depositDeduction), 256, y + 73);

          // Col 3 (x = 398, width = 150)
          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("EMERGENCY CONTACT", 398, y + 27);
          doc.fontSize(8).font("Helvetica").fillColor("#111111").text(
            t.emergencyContact ? `${t.emergencyContact} (${t.emergencyRelation || "Rel"})` : "—",
            398,
            y + 35,
            { width: 150, ellipsis: true }
          );

          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("SHARING TYPE", 398, y + 46);
          doc.fontSize(8.5).font("Helvetica").fillColor("#111111").text(`${t.sharingType}-sharing`, 398, y + 54);

          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("PROFESSION", 398, y + 65);
          const profText = t.profession ? `${t.profession}${t.professionDetail ? ` (${t.professionDetail})` : ""}` : "—";
          doc.fontSize(7.5).font("Helvetica").fillColor("#111111").text(profText, 398, y + 73, { width: 150, ellipsis: true });

          // ── Dashed Divider Line ──
          doc.save();
          doc.moveTo(114, y + 85).lineTo(548, y + 85).dash(2, { space: 2 }).lineWidth(0.8).strokeColor("#e5e7eb").stroke();
          doc.restore();

          // ── Bottom Rent Section ──
          const due = Math.max(0, t.monthlyRent - t.paidAmount);

          // MONTHLY RENT
          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("MONTHLY RENT", 114, y + 90);
          doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#111111").text(fmtRs(t.monthlyRent), 114, y + 98);

          // PAID (OCTOBER 2026)
          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text(`PAID (${data.monthLabel.toUpperCase()})`, 195, y + 90);
          doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#111111").text(fmtRs(t.paidAmount), 195, y + 98);

          // REMAINING
          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("REMAINING", 305, y + 90);
          doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#111111").text(fmtRs(due), 305, y + 98);

          // Status Badge
          const isPaid = t.rentStatus === "paid" || due === 0;
          const badgeBg = isPaid ? "#dcfce7" : "#fee2e2";
          const badgeColor = isPaid ? "#16a34a" : "#dc2626";
          const badgeText = isPaid ? "PAID ✓" : `${fmtRs(due)} DUE`;

          doc.roundedRect(375, y + 93, 72, 16, 4).fill(badgeBg);
          doc.fontSize(8).font("Helvetica-Bold").fillColor(badgeColor).text(badgeText, 375, y + 97, { width: 72, align: "center" });

          // Mode
          doc.fontSize(8).font("Helvetica").fillColor("#666666").text(`via ${t.paymentMode || "cash"}`, 455, y + 97);

          y += cardHeight + 12;
        });

        y += 4;
      });

      // Bottom Sign-off Box
      if (y > 720) {
        doc.addPage();
        y = 36;
      } else {
        y = Math.max(y + 10, 720);
      }

      doc.roundedRect(36, y, 523, 44, 6).lineWidth(1).fillAndStroke("#ffffff", "#cbd5e1");
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
