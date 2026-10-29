/**
 * Centralized Site and API Configuration
 * Supports Vercel deployment (https://pg-eg-web.vercel.app)
 * and Render backend (https://pg-eg.onrender.com)
 */

export function getAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "https://pg-eg-web.vercel.app";
}

export function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    return "https://pg-eg.onrender.com";
  }
  return "http://localhost:4000";
}

export const APP_URL = getAppUrl();
export const API_URL = getApiUrl();

