import nodemailer from "nodemailer";
import { Resend } from "resend";
import fs from "fs";
import path from "path";
import { PgReportData } from "./pdfReportGenerator";

export interface SendMonthlyReportParams {
  to: string;
  ownerName: string;
  pgName: string;
  monthLabel: string;
  reportData: PgReportData;
  pdfBuffer: Buffer;
}

export interface MailerResult {
  success: boolean;
  provider: "resend" | "smtp" | "preview";
  messageId?: string;
  previewUrl?: string;
  savedPath?: string;
}

export function buildEmailHTML(params: {
  ownerName: string;
  pgName: string;
  monthLabel: string;
  data: PgReportData;
}): string {
  const { ownerName, pgName, monthLabel, data } = params;
  const fmtRs = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

  const rowsHtml = data.tenants
    .map(
      (t) => `
    <tr style="border-bottom: 1px solid #f1f5f9;">
      <td style="padding: 10px 12px; font-weight: 700; color: #0f172a;">
        ${t.name}
        <span style="font-size: 10px; color: ${t.status === "active" ? "#16a34a" : "#dc2626"}; background: ${t.status === "active" ? "#dcfce7" : "#fee2e2"}; padding: 1px 6px; border-radius: 10px; margin-left: 4px;">
          ${t.status === "active" ? "Active" : "Inactive"}
        </span>
      </td>
      <td style="padding: 10px 12px; color: #475569;">Floor ${t.floor} · Room ${t.roomNumber} · Bed ${t.bedNumber}</td>
      <td style="padding: 10px 12px; color: #475569;">+91 ${t.phone}</td>
      <td style="padding: 10px 12px; text-align: right; color: ${t.rentStatus === "paid" ? "#16a34a" : "#dc2626"}; font-weight: 800;">
        ${t.rentStatus === "paid" ? `${fmtRs(t.paidAmount)} PAID ✓` : `${fmtRs(t.monthlyRent - t.paidAmount)} DUE`}
      </td>
    </tr>
  `
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${pgName} – Tenants & Rent Record (${monthLabel})</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px;">
  <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06);">
    
    <!-- Brand Header -->
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px 28px; color: #ffffff;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <span style="font-size: 20px; font-weight: 900; letter-spacing: 0.5px; color: #10b981;">
          PG-EG <span style="color: #ffffff; font-size: 13px; font-weight: 500;">· Owner Safety Services</span>
        </span>
        <span style="background: #10b981; color: #ffffff; font-size: 10.5px; font-weight: 800; padding: 4px 10px; border-radius: 20px; text-transform: uppercase;">
          Physical Backup Copy
        </span>
      </div>
      <h1 style="margin: 0 0 6px; font-size: 22px; font-weight: 800; color: #ffffff;">${pgName}</h1>
      <p style="margin: 0; font-size: 13px; color: #94a3b8;">
        Monthly Tenants & Rent Dossier · <strong>${monthLabel}</strong>
      </p>
    </div>

    <!-- Body Content -->
    <div style="padding: 24px 28px;">
      <p style="font-size: 15px; color: #1e293b; line-height: 1.6; margin-top: 0;">
        Dear <strong>${ownerName}</strong>,
      </p>
      <p style="font-size: 13.5px; color: #475569; line-height: 1.6;">
        Here is your official <strong>${monthLabel} Monthly Tenant Roster & Rent Record</strong> for <strong>${pgName}</strong>.
      </p>

      <!-- Important Notice Box -->
      <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px 16px; border-radius: 8px; margin: 20px 0;">
        <div style="font-weight: 800; font-size: 13px; color: #15803d; margin-bottom: 4px;">
          🖨️ Action Recommended: Download & Keep a Physical Print
        </div>
        <p style="margin: 0; font-size: 12.5px; color: #166534; line-height: 1.5;">
          For the complete safety of your property records and emergency compliance, please <strong>download the attached PDF and keep an updated physical print</strong> in your PG register binder.
        </p>
      </div>

      <!-- Quick Summary Cards -->
      <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin: 18px 0;">
        <tr>
          <td style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center; width: 33%;">
            <span style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase;">Total Tenants</span>
            <div style="font-size: 20px; font-weight: 900; color: #0f172a; margin-top: 4px;">${data.totalTenants}</div>
            <span style="font-size: 10px; color: #10b981; font-weight: 700;">${data.paidCount} Paid</span>
          </td>
          <td style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center; width: 33%;">
            <span style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase;">Total Rent</span>
            <div style="font-size: 20px; font-weight: 900; color: #0f172a; margin-top: 4px;">${fmtRs(data.totalRent)}</div>
            <span style="font-size: 10px; color: #10b981; font-weight: 700;">${fmtRs(data.collected)} Collected</span>
          </td>
          <td style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; text-align: center; width: 33%;">
            <span style="font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase;">Pending Dues</span>
            <div style="font-size: 20px; font-weight: 900; color: ${data.pending === 0 ? "#16a34a" : "#dc2626"}; margin-top: 4px;">
              ${fmtRs(data.pending)}
            </div>
            <span style="font-size: 10px; color: ${data.pending === 0 ? "#16a34a" : "#dc2626"}; font-weight: 700;">
              ${data.pending === 0 ? "All Cleared ✓" : "Follow-up Required"}
            </span>
          </td>
        </tr>
      </table>

      <!-- Tenant Roster Snapshot Table -->
      <div style="margin-top: 20px;">
        <div style="font-size: 12px; font-weight: 800; color: #0f172a; text-transform: uppercase; margin-bottom: 8px;">
          Tenant Roster &amp; Payment Summary
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #f1f5f9; text-align: left; color: #475569; font-weight: 700;">
              <th style="padding: 9px 12px; border-radius: 6px 0 0 6px;">Tenant</th>
              <th style="padding: 9px 12px;">Room</th>
              <th style="padding: 9px 12px;">Phone</th>
              <th style="padding: 9px 12px; text-align: right; border-radius: 0 6px 6px 0;">Rent Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <!-- Action Button -->
      <div style="text-align: center; margin: 30px 0 10px;">
        <p style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
          The complete high-resolution printable dossier is attached below as a PDF document.
        </p>
        <span style="display: inline-block; background: #0f172a; color: #ffffff; padding: 12px 28px; border-radius: 8px; font-size: 13.5px; font-weight: 800; text-decoration: none;">
          📎 ${pgName.replace(/[^a-zA-Z0-9]/g, "_")}_Tenants_${monthLabel.replace(/\s+/g, "_")}.pdf
        </span>
      </div>
    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 28px; text-align: center; font-size: 11px; color: #64748b;">
      <p style="margin: 0 0 4px;">
        PG-EG Digital Property Management System ·
        <a href="https://www.pgeg.in" style="color: #10b981; text-decoration: none; font-weight: 700;">www.pgeg.in</a>
      </p>
      <p style="margin: 0;">
        Automated safety record dispatched on the 15th and month-end closing to ensure permanent physical records.
      </p>
    </div>

  </div>
</body>
</html>
  `;
}

export async function sendMonthlyTenantReport(params: SendMonthlyReportParams): Promise<MailerResult> {
  const { to, ownerName, pgName, monthLabel, reportData, pdfBuffer } = params;
  const safeName = pgName.replace(/[^a-zA-Z0-9]/g, "_");
  const safeMonth = monthLabel.replace(/\s+/g, "_");
  const attachmentFileName = `${safeName}_Tenants_Report_${safeMonth}.pdf`;
  const subject = `📋 Physical Backup Copy: ${pgName} – Tenants & Rent Record (${monthLabel})`;
  const htmlContent = buildEmailHTML({ ownerName, pgName, monthLabel, data: reportData });

  // 1. Try Resend if RESEND_API_KEY is configured
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.EMAIL_FROM || "PG-EG Safety Desk <records@pgeg.in>";

      const res = await resend.emails.send({
        from: fromEmail,
        to: [to],
        subject,
        html: htmlContent,
        attachments: [
          {
            filename: attachmentFileName,
            content: pdfBuffer,
          },
        ],
      });

      console.log(`[Mailer] Resend email dispatched to ${to} (ID: ${res.data?.id})`);
      return { success: true, provider: "resend", messageId: res.data?.id };
    } catch (err: any) {
      console.error("[Mailer] Resend error:", err);
      // Fall through to SMTP or preview
    }
  }

  // 2. Try Nodemailer SMTP if SMTP_USER & SMTP_PASS are configured
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE !== "false", // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || `"PG-EG Safety Desk" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html: htmlContent,
        attachments: [
          {
            filename: attachmentFileName,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });

      console.log(`[Mailer] SMTP email sent to ${to} (MessageId: ${info.messageId})`);
      return { success: true, provider: "smtp", messageId: info.messageId };
    } catch (err: any) {
      console.error("[Mailer] SMTP error:", err);
      // Fall through to preview
    }
  }

  // 3. Fallback / Test Mode: Save PDF locally and log email details
  const outDir = path.resolve(process.cwd(), "temp_reports");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const filePath = path.join(outDir, attachmentFileName);
  fs.writeFileSync(filePath, pdfBuffer);

  console.log(`\n============================================================`);
  console.log(`📧 [MAILER PREVIEW MODE] Email to: ${to} (${ownerName})`);
  console.log(`   Subject: ${subject}`);
  console.log(`   Attached PDF saved locally at: ${filePath}`);
  console.log(`   Notice: Configure RESEND_API_KEY or SMTP_USER & SMTP_PASS in apps/server/.env for direct inbox dispatch.`);
  console.log(`============================================================\n`);

  return {
    success: true,
    provider: "preview",
    savedPath: filePath,
  };
}
