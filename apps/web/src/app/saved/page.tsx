import type { Metadata } from "next";
import SavedPGsClient from "./SavedPGsClient";

export const metadata: Metadata = { title: "Saved PGs | PG-EG" };

export default function SavedPage() {
  return <SavedPGsClient />;
}
