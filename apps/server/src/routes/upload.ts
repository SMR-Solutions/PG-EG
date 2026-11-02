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

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "mp4", "webm", "mov", "pdf"]);
const ALLOWED_MIME_PREFIXES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",  // iOS native — browser usually converts to JPEG bytes before upload
  "image/heif",
  "image/bmp",
  "image/gif",
  "image/tiff",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
];

// Map MIME types to safe file extensions for camera captures that may have missing/wrong extensions
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "jpg",
  "image/heif": "jpg",
  "image/bmp": "jpg",
  "image/gif": "png",
  "image/tiff": "jpg",
};

// Max file size: ~50MB binary (~70MB base64 string)
const MAX_BASE64_LENGTH = 70 * 1024 * 1024;

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
      res.status(413).json({ error: "File payload exceeds maximum allowed size (50MB)" });
      return;
    }

    // Extract MIME type from base64 data URL prefix (present for camera/FileReader uploads)
    let mimeFromData: string | null = null;
    let fileData = base64;
    if (base64.startsWith("data:")) {
      const mimeMatch = base64.match(/^data:([^;]+);base64,/);
      if (mimeMatch) {
        mimeFromData = mimeMatch[1].toLowerCase();
        const isAllowedMime = ALLOWED_MIME_PREFIXES.some((m) => mimeFromData!.startsWith(m));
        if (!isAllowedMime) {
          res.status(400).json({ error: `Unsupported MIME type: ${mimeFromData}` });
          return;
        }
      }
      fileData = base64.includes(",") ? base64.split(",")[1] : base64;
    }

    // Sanitize filename
    let cleanFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

    // Validate extension — for camera captures, the sent name ext is already resolved on client.
    // But as a safety net: if the ext is missing or not in our allow-list, derive it from MIME.
    const rawExt = cleanFileName.split(".").pop()?.toLowerCase();
    if (!rawExt || !ALLOWED_EXTENSIONS.has(rawExt)) {
      if (mimeFromData && MIME_TO_EXT[mimeFromData]) {
        // Safe: replace the bad/missing extension with MIME-derived extension
        const safeExt = MIME_TO_EXT[mimeFromData];
        const nameWithoutExt = cleanFileName.includes(".")
          ? cleanFileName.slice(0, cleanFileName.lastIndexOf("."))
          : cleanFileName;
        cleanFileName = `${nameWithoutExt}.${safeExt}`;
        console.log(`[Upload] Fixed extension from MIME ${mimeFromData}: ${fileName} -> ${cleanFileName}`);
      } else {
        res.status(400).json({
          error: `Invalid file extension .${rawExt || ""}. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(", ")}`,
        });
        return;
      }
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
