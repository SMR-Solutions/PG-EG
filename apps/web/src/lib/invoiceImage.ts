/**
 * generateInvoiceImage — draws a professional rent invoice on an HTML Canvas
 * and returns a data URL (PNG). No external dependencies — pure browser Canvas API.
 */
export interface InvoiceData {
  pgName: string;
  pgType?: string | null;
  tenantName: string;
  roomNumber: string;
  bedNumber: string | number;
  floor: string | number;
  monthStr: string;
  amountDue: number;
  upi?: string | null;
  upiDeepLink?: string | null;
  qrImageUrl?: string | null;
}

export async function generateInvoiceImage(data: InvoiceData): Promise<string> {
  // Load QR image first (cross-origin) before drawing
  let qrImg: HTMLImageElement | null = null;
  if (data.qrImageUrl) {
    qrImg = await loadImage(data.qrImageUrl);
  }

  const W = 540;
  // Estimate height
  const H = 900 + (qrImg ? 200 : 0);

  const canvas = document.createElement("canvas");
  canvas.width = W * 2;   // 2x for retina
  canvas.height = H * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);

  // ── Background ──────────────────────────────────────────────────────────────
  // White card
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, 0, 0, W, H, 0);
  ctx.fill();

  // Accent top bar
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "#1a1f2e");
  grad.addColorStop(1, "#2a3050");
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, W, 100, 0);
  ctx.fill();

  // ── PG Name (header) ────────────────────────────────────────────────────────
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 26px 'Inter', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(data.pgName, W / 2, 46);
  if (data.pgType) {
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "14px 'Inter', Arial, sans-serif";
    ctx.fillText(data.pgType, W / 2, 68);
  }

  // PG-EG badge top-right
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  roundRect(ctx, W - 80, 12, 68, 26, 8);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px Arial";
  ctx.textAlign = "center";
  ctx.fillText("PG-EG", W - 46, 30);

  // ── Rent Reminder label ──────────────────────────────────────────────────────
  ctx.fillStyle = "#6b7280";
  ctx.font = "11px 'Inter', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("RENT REMINDER", W / 2, 128);

  let y = 150;

  // ── Detail rows ─────────────────────────────────────────────────────────────
  const rows: [string, string][] = [
    ["Tenant", data.tenantName],
    ["Room · Bed", `${data.roomNumber}  ·  Bed ${data.bedNumber}  ·  Floor ${data.floor}`],
    ["Period", data.monthStr],
  ];

  for (const [label, value] of rows) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "10px 'Inter', Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(label.toUpperCase(), 40, y);
    ctx.fillStyle = "#111827";
    ctx.font = "bold 15px 'Inter', Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(value, W - 40, y);
    y += 14;
    // divider
    ctx.strokeStyle = "#f3f4f6";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(40, y + 4); ctx.lineTo(W - 40, y + 4); ctx.stroke();
    y += 22;
  }

  y += 10;

  // ── Amount Due ───────────────────────────────────────────────────────────────
  ctx.fillStyle = "#f3f4f6";
  roundRect(ctx, 30, y, W - 60, 76, 14);
  ctx.fill();

  ctx.fillStyle = "#6b7280";
  ctx.font = "10px 'Inter', Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("AMOUNT DUE", 50, y + 22);

  ctx.fillStyle = "#dc2626";
  ctx.font = "bold 36px 'Inter', Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`₹${data.amountDue.toLocaleString("en-IN")}`, W - 50, y + 58);

  y += 96;

  // ── Divider ──────────────────────────────────────────────────────────────────
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 40, y); ctx.stroke();
  y += 24;

  // ── Pay Instantly header ─────────────────────────────────────────────────────
  ctx.fillStyle = "#111827";
  ctx.font = "bold 14px 'Inter', Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("PAY INSTANTLY", 40, y);
  y += 20;

  // ── UPI section ──────────────────────────────────────────────────────────────
  if (data.upi) {
    // UPI pill
    ctx.fillStyle = "#f0fdf4";
    ctx.strokeStyle = "#bbf7d0";
    ctx.lineWidth = 1.5;
    roundRectStroke(ctx, 40, y, W - 80, 44, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#15803d";
    ctx.font = "bold 13px 'Inter', Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("UPI ID:", 56, y + 18);
    ctx.font = "bold 15px 'Inter', Arial, sans-serif";
    ctx.fillText(data.upi, 56, y + 36);
    y += 56;
  }

  if (data.upiDeepLink) {
    ctx.fillStyle = "#6366f1";
    roundRect(ctx, 40, y, W - 80, 40, 10);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px 'Inter', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("⚡  Tap to Pay:  " + (data.upi ?? ""), W / 2, y + 25);
    y += 52;
  }

  // ── QR Code ──────────────────────────────────────────────────────────────────
  if (qrImg) {
    const qrSize = 160;
    const qrX = (W - qrSize) / 2;
    y += 8;

    // QR white frame
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 2;
    roundRectStroke(ctx, qrX - 12, y - 12, qrSize + 24, qrSize + 24, 14);
    ctx.fill();
    ctx.stroke();

    ctx.drawImage(qrImg, qrX, y, qrSize, qrSize);
    y += qrSize + 24;

    ctx.fillStyle = "#6b7280";
    ctx.font = "11px 'Inter', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Scan to pay", W / 2, y);
    y += 20;
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  y += 14;
  ctx.strokeStyle = "#e5e7eb";
  ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(W - 40, y); ctx.stroke();
  y += 18;
  ctx.fillStyle = "#9ca3af";
  ctx.font = "10px 'Inter', Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Generated by PG-EG  ·  Tenant Management Platform", W / 2, y);

  return canvas.toDataURL("image/png");
}

// ── helpers ─────────────────────────────────────────────────────────────────
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function roundRectStroke(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  roundRect(ctx, x, y, w, h, r);
}
