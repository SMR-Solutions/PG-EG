import { Router, Request, Response } from "express";

const router = Router();

// Lazy-initialize so env vars are loaded by the time this is called
// (dotenv.config() runs in index.ts before any requests are handled)
function getImageKit() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ImageKit = require("imagekit");
  return new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
  });
}

// POST /api/upload
// Body: { base64: string, fileName: string, folder?: string }
router.post("/", async (req: Request, res: Response) => {
  try {
    const { base64, fileName, folder = "pg-eg/tenants" } = req.body as {
      base64: string;
      fileName: string;
      folder?: string;
    };

    if (!base64 || !fileName) {
      res.status(400).json({ error: "base64 and fileName are required" });
      return;
    }

    // Strip data URL prefix if present (e.g. "data:image/jpeg;base64,...")
    const fileData = base64.includes(",") ? base64.split(",")[1] : base64;

    const ik = getImageKit();
    const result = await ik.upload({
      file: fileData,
      fileName,
      folder,
      useUniqueFileName: true,
    });

    res.json({ url: result.url, fileId: result.fileId });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Upload failed. Check ImageKit credentials." });
  }
});

export default router;
