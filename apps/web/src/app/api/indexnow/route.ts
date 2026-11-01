import { NextResponse } from "next/server";
import { BANGALORE_LOCATIONS } from "@/data/bangaloreLocations";
import { APP_URL } from "@/lib/siteConfig";

const INDEXNOW_KEY = "c4f92e85a1b3497d91e804f9812bc853";

export async function POST() {
  try {
    const host = new URL(APP_URL).host;

    const urlList = [
      `${APP_URL}/`,
      `${APP_URL}/bangalore`,
      `${APP_URL}/find-pg`,
      ...BANGALORE_LOCATIONS.map((loc) => `${APP_URL}/bangalore/${loc.slug}`),
    ];

    const payload = {
      host,
      key: INDEXNOW_KEY,
      keyLocation: `${APP_URL}/${INDEXNOW_KEY}.txt`,
      urlList,
    };

    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });

    return NextResponse.json({
      success: res.ok,
      status: res.status,
      submittedUrls: urlList.length,
    });
  } catch (error) {
    console.error("IndexNow submission error:", error);
    return NextResponse.json({ error: "Failed to submit to IndexNow" }, { status: 500 });
  }
}

export async function GET() {
  return POST();
}

