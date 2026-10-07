"use client";

import Link from "next/link";
import styles from "../legal.module.css";

export default function TermsPage() {
  return (
    <main className={styles.container}>
      <Link href="/" className={styles.backBtn}>
        ← Back to Home
      </Link>

      <h1 className={styles.title}>Terms of Service</h1>
      <p className={styles.lastUpdated}>Last Updated: October 2026</p>

      <div className={styles.section}>
        <h2 className={styles.heading}>For Students & Seekers</h2>
        <ul className={styles.list}>
          <li><strong>Free to use:</strong> Searching and finding PGs on PG-EG is completely free. No hidden charges.</li>
          <li><strong>Direct Contact:</strong> We connect you directly with PG owners. We do not act as brokers.</li>
          <li><strong>Authenticity:</strong> We strive to show accurate details provided by PG owners, but always verify before making payments.</li>
          <li><strong>No Spam:</strong> Your contact details are only shared with the PG you explicitly choose to join or contact.</li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2 className={styles.heading}>For PG Owners</h2>
        <ul className={styles.list}>
          <li><strong>Your PG, Your Rules:</strong> You have full control over your digital PG profile, room allocations, and rent collection.</li>
          <li><strong>Accurate Information:</strong> You are responsible for keeping your PG details, photos, and availability accurate and up to date.</li>
          <li><strong>Data Privacy:</strong> Tenant data you collect through the app must be kept secure and used only for PG management purposes.</li>
          <li><strong>Fair Usage:</strong> PG-EG provides tools like WhatsApp reminders and digital vaults. Do not misuse these for spam or harassment.</li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2 className={styles.heading}>General Terms</h2>
        <ul className={styles.list}>
          <li><strong>Account Security:</strong> You are responsible for maintaining the security of your account and password.</li>
          <li><strong>Platform Changes:</strong> We continuously improve PG-EG. Features may be added, updated, or removed to provide a better experience.</li>
          <li><strong>Termination:</strong> We reserve the right to suspend accounts that violate these terms, engage in fraud, or misuse the platform.</li>
        </ul>
      </div>
    </main>
  );
}
