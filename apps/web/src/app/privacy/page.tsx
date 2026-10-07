"use client";

import Link from "next/link";
import styles from "../legal.module.css";

export default function PrivacyPage() {
  return (
    <main className={styles.container}>
      <Link href="/" className={styles.backBtn}>
        ← Back to Home
      </Link>

      <h1 className={styles.title}>Privacy Policy</h1>
      <p className={styles.lastUpdated}>Last Updated: October 2026</p>

      <div className={styles.section}>
        <h2 className={styles.heading}>Your Data is Yours</h2>
        <ul className={styles.list}>
          <li><strong>Zero Spam Guarantee:</strong> We hate spam as much as you do. We do not sell your personal data to third-party marketers or brokers.</li>
          <li><strong>Purpose-Built:</strong> We only collect the information necessary to make finding a PG or managing a PG seamless.</li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2 className={styles.heading}>Information for Students</h2>
        <ul className={styles.list}>
          <li><strong>Location Data:</strong> When you use &quot;Find PG Near Me&quot;, we request your location solely to show nearby properties. This data is not permanently tracked or logged.</li>
          <li><strong>Contact Details:</strong> Your phone number and details are shared <strong>only</strong> with the PG owners you actively choose to engage with.</li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2 className={styles.heading}>Information for PG Owners</h2>
        <ul className={styles.list}>
          <li><strong>Secure Vault:</strong> Documents you upload (rent agreements, tenant IDs) are stored securely and privately. Only you have access to them.</li>
          <li><strong>Financial Privacy:</strong> Rent tracking, collection reports, and expense logs are 100% private to your dashboard. We do not share your financial metrics.</li>
          <li><strong>Visibility:</strong> Information you explicitly set as &quot;Public&quot; (like PG photos, sharing types, rent ranges) will be visible to students searching for PGs.</li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2 className={styles.heading}>Security & Communications</h2>
        <ul className={styles.list}>
          <li><strong>WhatsApp Reminders:</strong> When generating WhatsApp rent reminders, the message is sent securely from your own device using the WhatsApp API.</li>
          <li><strong>Data Safety:</strong> We use industry-standard encryption to protect your data across our mobile and web platforms.</li>
          <li><strong>Support:</strong> If you have privacy concerns or wish to delete your account data entirely, contact us anytime at <a href="mailto:studentstoreforstudents@gmail.com" style={{color: '#2dc653'}}>studentstoreforstudents@gmail.com</a>.</li>
        </ul>
      </div>
    </main>
  );
}
