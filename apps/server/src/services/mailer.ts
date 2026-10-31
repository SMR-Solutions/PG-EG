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
  attachmentFileName: string;
}): string {
  const { ownerName, pgName, monthLabel, data, attachmentFileName } = params;
  const fmtRs = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${pgName} – Tenants & Rent Record (${monthLabel})</title>
  <style>
    /* Reset & Base */
    body, table, td, p, a, li, blockquote {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    table, td {
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    img {
      -ms-interpolation-mode: bicubic;
      border: 0;
      height: auto;
      line-height: 100%;
      outline: none;
      text-decoration: none;
    }
    body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      height: 100% !important;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    /* Mobile Responsive Overrides */
    @media only screen and (max-width: 520px) {
      .email-wrapper {
        padding: 8px 4px !important;
      }
      .email-card {
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 8px !important;
      }
      .header-pad {
        padding: 18px 16px !important;
      }
      .content-pad {
        padding: 18px 14px !important;
      }
      .header-flex {
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 8px !important;
      }
      .header-pill {
        align-self: flex-start !important;
      }
      /* Stack summary cards vertically on mobile */
      .stat-table {
        display: block !important;
        width: 100% !important;
      }
      .stat-row {
        display: block !important;
        width: 100% !important;
      }
      .stat-col {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        margin-bottom: 8px !important;
        box-sizing: border-box !important;
      }
      .attachment-btn {
        width: 100% !important;
        box-sizing: border-box !important;
        padding: 12px 14px !important;
        font-size: 12px !important;
      }
      .attachment-text {
        font-size: 12px !important;
        word-break: break-all !important;
      }
    }
  </style>
</head>
<body style="background-color: #f1f5f9; margin: 0; padding: 24px 10px;">
  <div class="email-wrapper" style="max-width: 600px; margin: 0 auto;">
    <div class="email-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.05);">
      
      <!-- Brand Header -->
      <div class="header-pad" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 22px 26px; color: #ffffff;">
        <div class="header-flex" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 8px;">
          <span style="font-size: 19px; font-weight: 900; letter-spacing: 0.5px; color: #10b981;">
            PG-EG <span style="color: #ffffff; font-size: 12px; font-weight: 500;">· Owner Safety Services</span>
          </span>
          <span class="header-pill" style="background: #10b981; color: #ffffff; font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
            Physical Backup Copy
          </span>
        </div>
        <h1 style="margin: 0 0 6px; font-size: 21px; font-weight: 800; color: #ffffff; line-height: 1.2;">${pgName}</h1>
        <p style="margin: 0; font-size: 12.5px; color: #94a3b8;">
          Monthly Tenants & Rent Dossier · <strong style="color: #e2e8f0;">${monthLabel}</strong>
        </p>
      </div>

      <!-- Main Body Content -->
      <div class="content-pad" style="padding: 24px 26px;">
        <p style="font-size: 15px; color: #1e293b; line-height: 1.5; margin: 0 0 10px;">
          Dear <strong>${ownerName}</strong>,
        </p>
        <p style="font-size: 13.5px; color: #475569; line-height: 1.5; margin: 0 0 18px;">
          Here is your official <strong>${monthLabel} Monthly Tenant Roster & Rent Record</strong> for <strong>${pgName}</strong>.
        </p>

        <!-- Important Notice Box -->
        <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px 16px; border-radius: 8px; margin: 0 0 20px;">
          <div style="font-weight: 800; font-size: 13px; color: #15803d; margin-bottom: 4px;">
            🖨️ Action Recommended: Download & Keep a Physical Print
          </div>
          <p style="margin: 0; font-size: 12.5px; color: #166534; line-height: 1.5;">
            For the complete safety of your property records and emergency compliance, please <strong>download the attached PDF and keep an updated physical print</strong> in your PG register binder.
          </p>
        </div>

        <!-- Fluid Summary Cards -->
        <table class="stat-table" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 20px; border-collapse: separate; border-spacing: 6px;">
          <tr class="stat-row">
            <td class="stat-col" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 8px; text-align: center; width: 33%; vertical-align: top;">
              <div style="font-size: 9.5px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Total Tenants</div>
              <div style="font-size: 18px; font-weight: 900; color: #0f172a; margin: 4px 0 2px;">${data.totalTenants}</div>
              <div style="font-size: 10px; color: #10b981; font-weight: 700;">${data.paidCount} Paid</div>
            </td>
            <td class="stat-col" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 8px; text-align: center; width: 33%; vertical-align: top;">
              <div style="font-size: 9.5px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Total Rent</div>
              <div style="font-size: 18px; font-weight: 900; color: #0f172a; margin: 4px 0 2px;">${fmtRs(data.totalRent)}</div>
              <div style="font-size: 10px; color: #10b981; font-weight: 700;">${fmtRs(data.collected)} Collected</div>
            </td>
            <td class="stat-col" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 8px; text-align: center; width: 33%; vertical-align: top;">
              <div style="font-size: 9.5px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Pending Dues</div>
              <div style="font-size: 18px; font-weight: 900; color: ${data.pending === 0 ? "#16a34a" : "#dc2626"}; margin: 4px 0 2px;">
                ${fmtRs(data.pending)}
              </div>
              <div style="font-size: 10px; color: ${data.pending === 0 ? "#16a34a" : "#dc2626"}; font-weight: 700;">
                ${data.pending === 0 ? "All Cleared ✓" : "Follow-up Required"}
              </div>
            </td>
          </tr>
        </table>

        <!-- Attachment Download Banner -->
        <div style="text-align: center; margin: 24px 0 6px;">
          <p style="font-size: 12px; color: #64748b; margin: 0 0 10px; line-height: 1.4;">
            The complete high-resolution printable dossier is attached below as a PDF document.
          </p>
          <div class="attachment-btn" style="display: inline-block; background: #0f172a; color: #ffffff; padding: 12px 18px; border-radius: 8px; max-width: 100%; box-sizing: border-box; text-align: center;">
            <span style="font-size: 14px; vertical-align: middle; margin-right: 5px;">📎</span>
            <span class="attachment-text" style="font-size: 12.5px; font-weight: 700; color: #ffffff; vertical-align: middle; word-break: break-all;">
              ${attachmentFileName}
            </span>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center; font-size: 11px; color: #64748b; line-height: 1.5;">
        <p style="margin: 0 0 4px;">
          PG-EG Digital Property Management System ·
          <a href="https://www.pgeg.in" style="color: #10b981; text-decoration: none; font-weight: 700;">www.pgeg.in</a>
        </p>
        <p style="margin: 0; font-size: 10.5px; color: #94a3b8;">
          Automated safety record dispatched on the 15th and month-end closing to ensure permanent physical records.
        </p>
      </div>

    </div>
  </div>
</body>
</html>`;
}

export async function sendMonthlyTenantReport(params: SendMonthlyReportParams): Promise<MailerResult> {
  const { to, ownerName, pgName, monthLabel, reportData, pdfBuffer } = params;
  const safeName = pgName.replace(/[^a-zA-Z0-9]/g, "_");
  const safeMonth = monthLabel.replace(/\s+/g, "_");
  const attachmentFileName = `${safeName}_Tenants_Report_${safeMonth}.pdf`;
  const subject = `📋 Physical Backup Copy: ${pgName} – Tenants & Rent Record (${monthLabel})`;
  const htmlContent = buildEmailHTML({
    ownerName,
    pgName,
    monthLabel,
    data: reportData,
    attachmentFileName,
  });
  const recipient = process.env.TEST_EMAIL_OVERRIDE || to;

  // 1. Try Resend if RESEND_API_KEY is configured
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.EMAIL_FROM || "PG-EG Safety Desk <onboarding@resend.dev>";

      const res = await resend.emails.send({
        from: fromEmail,
        to: [recipient],
        subject,
        html: htmlContent,
        attachments: [
          {
            filename: attachmentFileName,
            content: pdfBuffer,
          },
        ],
      });

      if (res.error) {
        console.error("[Mailer] Resend API error:", res.error);
        throw new Error(res.error.message || "Resend email dispatch error");
      }

      console.log(`[Mailer] Resend email dispatched to ${recipient} (ID: ${res.data?.id})`);
      return { success: true, provider: "resend", messageId: res.data?.id };
    } catch (err: any) {
      console.error("[Mailer] Resend failed:", err?.message || err);
      // Fall through to SMTP
    }
  }

  // 2. Try Nodemailer SMTP if SMTP_USER & SMTP_PASS are configured
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 465,
        secure: process.env.SMTP_SECURE !== "false", // true for 465
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM || `"PG-EG Safety Desk" <${process.env.SMTP_USER}>`,
        to: recipient,
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

      console.log(`[Mailer] SMTP email sent to ${recipient} (MessageId: ${info.messageId})`);
      return { success: true, provider: "smtp", messageId: info.messageId };
    } catch (err: any) {
      console.error("[Mailer] SMTP error:", err);
      // Fall through to preview mode
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
