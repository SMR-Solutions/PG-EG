import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";

const router = Router();

// Lazy-initialize ImageKit client
function getImageKit() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ImageKit = require("imagekit");
  return new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
  });
}

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "mp4", "webm", "pdf"]);
const ALLOWED_MIME_PREFIXES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
];

// Max file size: ~15MB binary (~21MB base64 string)
const MAX_BASE64_LENGTH = 22 * 1024 * 1024;

// POST /api/upload
// Authenticated route — requires valid Bearer token
// Body: { base64: string, fileName: string, folder?: string }
router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    const { base64, fileName, folder = "pg-eg/tenants" } = req.body as {
      base64?: string;
      fileName?: string;
      folder?: string;
    };

    if (!base64 || !fileName) {
      res.status(400).json({ error: "base64 and fileName are required" });
      return;
    }

    if (typeof base64 !== "string" || base64.length > MAX_BASE64_LENGTH) {
      res.status(413).json({ error: "File payload exceeds maximum allowed size (15MB)" });
      return;
    }

    // Sanitize and validate filename & extension
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = cleanFileName.split(".").pop()?.toLowerCase();
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      res.status(400).json({
        error: `Invalid file extension .${ext || ""}. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`,
      });
      return;
    }

    // Validate folder structure: must start with "pg-eg/" and no path traversal
    if (
      typeof folder !== "string" ||
      !folder.startsWith("pg-eg/") ||
      folder.includes("..") ||
      folder.includes("\\")
    ) {
      res.status(400).json({ error: "Invalid target storage folder" });
      return;
    }

    // If data URL prefix is present, validate MIME type and strip it
    let fileData = base64;
    if (base64.startsWith("data:")) {
      const mimeMatch = base64.match(/^data:([^;]+);base64,/);
      if (mimeMatch) {
        const mime = mimeMatch[1].toLowerCase();
        const isAllowedMime = ALLOWED_MIME_PREFIXES.some((m) => mime.startsWith(m));
        if (!isAllowedMime) {
          res.status(400).json({ error: `Unsupported MIME type: ${mime}` });
          return;
        }
      }
      fileData = base64.includes(",") ? base64.split(",")[1] : base64;
    }

    const ik = getImageKit();
    const result = await ik.upload({
      file: fileData,
      fileName: cleanFileName,
      folder: folder.replace(/[^a-zA-Z0-9_\-\/]/g, ""),
      useUniqueFileName: true,
    });

    res.json({ url: result.url, fileId: result.fileId });
  } catch (error) {
    console.error("Upload error:", error);
    const msg = error instanceof Error ? error.message : "Upload failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
