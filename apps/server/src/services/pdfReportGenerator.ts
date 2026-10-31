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

      // Currency helper using 'Rs.' to guarantee 100% font compatibility in PDFKit Type 1 Standard Fonts
      const fmtRs = (n: number) => `Rs. ${Number(n || 0).toLocaleString("en-IN")}`;

      // ── Top Header Box (Slate Dark: #0f172a) ──
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
        .text(
          `Generated: ${new Date().toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}`,
          400,
          68,
          { align: "right", width: 145 }
        );
      doc
        .fontSize(8)
        .fillColor("#cbd5e1")
        .text("SAFETY COPY FOR OFFICE REGISTER", 400, 82, { align: "right", width: 145 });

      let y = 122;

      // ── Summary Cards ──
      const cardW = 124;
      const cardH = 44;
      const stats = [
        { label: "TOTAL TENANTS", val: `${data.totalTenants}`, sub: `${data.paidCount} Paid`, color: "#0f172a" },
        { label: "TOTAL RENT", val: fmtRs(data.totalRent), sub: data.monthLabel, color: "#0f172a" },
        {
          label: "COLLECTED",
          val: fmtRs(data.collected),
          sub: `${Math.round((data.collected / (data.totalRent || 1)) * 100)}% Collected`,
          color: "#16a34a",
        },
        {
          label: "PENDING DUES",
          val: fmtRs(data.pending),
          sub: data.pending === 0 ? "Fully Cleared" : "Follow-up Required",
          color: data.pending === 0 ? "#16a34a" : "#dc2626",
        },
      ];

      stats.forEach((st, i) => {
        const cx = 36 + i * (cardW + 9);
        doc.rect(cx, y, cardW, cardH).lineWidth(1).fillAndStroke("#f8fafc", "#e2e8f0");
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#64748b").text(st.label, cx + 8, y + 6);
        doc.fontSize(11).font("Helvetica-Bold").fillColor(st.color).text(st.val, cx + 8, y + 17);
        doc.fontSize(7.5).font("Helvetica").fillColor("#64748b").text(st.sub, cx + 8, y + 31);
      });

      y += 54;

      // Notice Callout
      doc.rect(36, y, 523, 22).lineWidth(1).fillAndStroke("#f0fdf4", "#bbf7d0");
      doc
        .fontSize(8.5)
        .font("Helvetica-Bold")
        .fillColor("#15803d")
        .text(
          "NOTICE: Please print and file this copy in your PG Office binder for physical verification & safety compliance.",
          44,
          y + 6
        );

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
        if (y > 700) {
          doc.addPage();
          y = 36;
        }

        // Floor Heading Bar (#1a1a2e rounded bar matching web export)
        doc.roundedRect(36, y, 523, 26, 6).fill("#1a1a2e");

        doc
          .fontSize(11)
          .font("Helvetica-Bold")
          .fillColor("#ffffff")
          .text(`Floor — ${floorNum}`, 48, y + 7);

        const fTotal = floorTenants.reduce((sum, t) => sum + t.monthlyRent, 0);
        const fPaid = floorTenants.reduce((sum, t) => sum + t.paidAmount, 0);
        const fPaidCount = floorTenants.filter((t) => t.rentStatus === "paid").length;

        const floorMetaText = `${floorTenants.length} tenant${
          floorTenants.length !== 1 ? "s" : ""
        }   ·   Collected Rs. ${fPaid.toLocaleString("en-IN")} / Rs. ${fTotal.toLocaleString(
          "en-IN"
        )}   ·   ${fPaidCount}/${floorTenants.length} paid`;

        doc
          .fontSize(8.5)
          .font("Helvetica-Bold")
          .fillColor("#94a3b8")
          .text(floorMetaText, 180, y + 8, { width: 365, align: "right" });

        y += 34;

        // Render each tenant card
        floorTenants.forEach((t) => {
          const cardHeight = 130;
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
            doc.roundedRect(48, y + 10, 64, 62, 6).clip();
            doc.image(imgs.photo, 48, y + 10, { width: 64, height: 62, fit: [64, 62] });
            doc.restore();
            doc.roundedRect(48, y + 10, 64, 62, 6).lineWidth(0.8).strokeColor("#e5e7eb").stroke();
          } else {
            doc.roundedRect(48, y + 10, 64, 62, 6).fill("#d1fae5");
            doc
              .fontSize(24)
              .font("Helvetica-Bold")
              .fillColor("#16a34a")
              .text(t.name[0]?.toUpperCase() || "?", 48, y + 26, { width: 64, align: "center" });
          }

          // ID Proof Thumbnail
          if (imgs?.id) {
            doc
              .fontSize(6)
              .font("Helvetica-Bold")
              .fillColor("#94a3b8")
              .text("ID PROOF", 48, y + 76, { width: 64, align: "center" });
            doc.save();
            doc.roundedRect(48, y + 84, 64, 38, 4).clip();
            doc.image(imgs.id, 48, y + 84, { width: 64, height: 38, fit: [64, 38] });
            doc.restore();
            doc.roundedRect(48, y + 84, 64, 38, 4).lineWidth(0.8).strokeColor("#e5e7eb").stroke();
          }

          // ── Right Column: Info Block ──
          // Line 1: Tenant Name
          doc.fontSize(13.5).font("Helvetica-Bold").fillColor("#111111").text(t.name, 122, y + 10);
          const nameW = doc.widthOfString(t.name);
          const pillX = 122 + nameW + 10;
          const isActive = t.status === "active";
          const statusLabel = isActive ? "Active" : `Checked out ${t.leavingDate || "—"}`;

          doc.fontSize(7.5).font("Helvetica-Bold");
          const statusW = doc.widthOfString(statusLabel);
          const pillW = statusW + 22;

          // Status Pill: background + vector circle dot (Guarantees zero %Ï character encoding errors)
          doc.roundedRect(pillX, y + 10, pillW, 14, 7).fill(isActive ? "#dcfce7" : "#fee2e2");
          doc.circle(pillX + 8, y + 17, 2.5).fill(isActive ? "#16a34a" : "#dc2626");
          doc
            .fontSize(7.5)
            .font("Helvetica-Bold")
            .fillColor(isActive ? "#16a34a" : "#dc2626")
            .text(statusLabel, pillX + 15, y + 13);

          // 3-Column Metadata Grid
          // Col 1 (x = 122, width = 136)
          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("PHONE", 122, y + 29);
          doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#111111").text(t.phone || "—", 122, y + 37);

          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("JOINING DATE", 122, y + 49);
          doc.fontSize(8.5).font("Helvetica").fillColor("#111111").text(t.joiningDate || "—", 122, y + 57);

          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("ADVANCE / DEPOSIT", 122, y + 69);
          doc.fontSize(8).font("Helvetica-Bold").fillColor("#111111").text(fmtRs(t.advanceAmount), 122, y + 77, { continued: true });
          doc.font("Helvetica").fillColor("#666666").text(` paid on ${t.joiningDate || "—"}`);

          // Col 2 (x = 264, width = 136)
          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("ALT PHONE", 264, y + 29);
          doc.fontSize(8.5).font("Helvetica").fillColor("#111111").text(t.altPhone || "—", 264, y + 37);

          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("FLOOR · ROOM · BED", 264, y + 49);
          doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#111111").text(`FL ${t.floor} · ${t.roomNumber} · Bed ${t.bedNumber}`, 264, y + 57);

          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("DEPOSIT DEDUCTED", 264, y + 69);
          doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#111111").text(fmtRs(t.depositDeduction), 264, y + 77);

          // Col 3 (x = 404, width = 146)
          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("EMERGENCY CONTACT", 404, y + 29);
          const emgText = t.emergencyContact
            ? `${t.emergencyContact} (${t.emergencyRelation || "Friend"})`
            : "—";
          doc.fontSize(8).font("Helvetica").fillColor("#111111").text(emgText, 404, y + 37, { width: 146, ellipsis: true });

          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("SHARING TYPE", 404, y + 49);
          doc.fontSize(8.5).font("Helvetica").fillColor("#111111").text(`${t.sharingType}-sharing`, 404, y + 57);

          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("PROFESSION", 404, y + 69);
          const profText = t.profession
            ? `${t.profession}${t.professionDetail ? ` (${t.professionDetail})` : ""}`
            : "—";
          doc.fontSize(7.5).font("Helvetica").fillColor("#111111").text(profText, 404, y + 77, { width: 146, ellipsis: true });

          // ── Dashed Divider Line ──
          doc.save();
          doc.moveTo(122, y + 90).lineTo(548, y + 90).dash(2, { space: 2 }).lineWidth(0.8).strokeColor("#e5e7eb").stroke();
          doc.restore();

          // ── Bottom Rent Section ──
          const due = Math.max(0, t.monthlyRent - t.paidAmount);

          // MONTHLY RENT
          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("MONTHLY RENT", 122, y + 95);
          doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#111111").text(fmtRs(t.monthlyRent), 122, y + 104);

          // PAID (OCTOBER 2026)
          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text(`PAID (${data.monthLabel.toUpperCase()})`, 212, y + 95);
          doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#111111").text(fmtRs(t.paidAmount), 212, y + 104);

          // REMAINING
          doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#888888").text("REMAINING", 310, y + 95);
          doc.fontSize(9.5).font("Helvetica-Bold").fillColor(due === 0 ? "#111111" : "#dc2626").text(fmtRs(due), 310, y + 104);

          // Status Badge: PAID with vector checkmark OR DUE
          const isPaid = t.rentStatus === "paid" || due === 0;
          if (isPaid) {
            doc.roundedRect(386, y + 99, 64, 18, 5).fill("#dcfce7");
            doc.fontSize(8).font("Helvetica-Bold").fillColor("#16a34a").text("PAID", 392, y + 104);
            // Draw vector checkmark
            doc.save();
            doc.lineWidth(1.4).strokeColor("#16a34a").lineCap("round").lineJoin("round");
            doc.moveTo(426, y + 107).lineTo(429, y + 111).lineTo(436, y + 104).stroke();
            doc.restore();
          } else {
            const dueText = `${fmtRs(due)} DUE`;
            doc.roundedRect(386, y + 99, 78, 18, 5).fill("#fee2e2");
            doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#dc2626").text(dueText, 386, y + 104, { width: 78, align: "center" });
          }

          // Payment Mode
          const modeX = isPaid ? 458 : 472;
          doc.fontSize(8).font("Helvetica").fillColor("#666666").text(`via ${t.paymentMode || "upi"}`, modeX, y + 104);

          y += cardHeight + 10;
        });

        y += 4;
      });

      // Bottom Sign-off Box
      if (y > 720) {
        doc.addPage();
        y = 36;
      } else {
        y = Math.max(y + 10, 715);
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
