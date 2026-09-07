const sharp = require("C:\\Users\\shaik\\AppData\\Roaming\\npm\\node_modules\\sharp-cli\\node_modules\\sharp");
const path = require("path");

const src = path.join(__dirname, "public", "logo-source.jpg");
const publicDir = path.join(__dirname, "public");
const appDir = path.join(__dirname, "src", "app");

const sizes = [
  { name: "favicon-16x16.png",    size: 16,  dest: publicDir },
  { name: "favicon-32x32.png",    size: 32,  dest: publicDir },
  { name: "favicon-48x48.png",    size: 48,  dest: publicDir },
  { name: "apple-touch-icon.png", size: 180, dest: publicDir },
  { name: "icon-192x192.png",     size: 192, dest: publicDir },
  { name: "icon-512x512.png",     size: 512, dest: publicDir },
  { name: "icon.png",             size: 512, dest: appDir    },
  { name: "apple-icon.png",       size: 180, dest: appDir    },
  { name: "pg-eg-logo.png",       size: 512, dest: publicDir },
];

async function generate() {
  for (const { name, size, dest } of sizes) {
    const outPath = path.join(dest, name);
    await sharp(src)
      .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(outPath);
    console.log(`✅ ${name} (${size}x${size})`);
  }
  // favicon.ico as 32px PNG (modern browsers accept PNG .ico)
  await sharp(src)
    .resize(32, 32, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(path.join(publicDir, "favicon.ico"));
  console.log("✅ favicon.ico (32x32)");
  console.log("\n🎉 All icons generated!");
}

generate().catch(console.error);
