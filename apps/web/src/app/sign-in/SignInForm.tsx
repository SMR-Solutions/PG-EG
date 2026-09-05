"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./page.module.css";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Step = "details" | "otp";

export default function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, isAuthenticated, isLoading } = useAuth();

  const [step, setStep] = useState<Step>("details");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [confirmationResult, setConfirmationResult] =
    useState<ConfirmationResult | null>(null);

  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const from = searchParams.get("from") || "/add-pg";
      router.replace(from);
    }
  }, [isAuthenticated, isLoading, router, searchParams]);

  // Countdown timer for resend OTP
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function setupRecaptcha() {
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
      });
    }
    return recaptchaRef.current;
  }

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError("Please enter your full name");
      return;
    }
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Please enter a valid 10-digit mobile number");
      return;
    }

    setSending(true);
    try {
      const verifier = setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, `+91${digits}`, verifier);
      setConfirmationResult(result);
      setStep("otp");
      setCountdown(60);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("too-many-requests")) {
        setError("Too many attempts. Please try again in a few minutes.");
      } else if (msg.includes("invalid-phone-number")) {
        setError("Invalid phone number. Please check and try again.");
      } else {
        setError("Failed to send OTP. Please try again.");
        console.error(err);
      }
      recaptchaRef.current = null;
    } finally {
      setSending(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setError("");
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
    if (newOtp.every((d) => d !== "")) handleVerifyOTP(newOtp.join(""));
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  async function handleVerifyOTP(code?: string) {
    const otpCode = code || otp.join("");
    if (otpCode.length !== 6 || !confirmationResult) return;

    setVerifying(true);
    setError("");
    try {
      const userCredential = await confirmationResult.confirm(otpCode);
      const idToken = await userCredential.user.getIdToken();

      const res = await fetch(`${API_URL}/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, name: name.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Verification failed");
      }

      const data = await res.json();
      signIn(data.token, data.owner, data.hasPG);

      if (data.hasPG) {
        router.replace("/dashboard");
      } else {
        router.replace(searchParams.get("from") || "/add-pg");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("invalid-verification-code")) {
        setError("Wrong OTP. Please check and try again.");
      } else if (msg.includes("code-expired")) {
        setError("OTP expired. Please request a new one.");
      } else {
        setError(msg || "Verification failed. Please try again.");
        console.error(err);
      }
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }

  function handleResendOTP() {
    setOtp(["", "", "", "", "", ""]);
    recaptchaRef.current = null;
    setStep("details");
    setCountdown(0);
    setConfirmationResult(null);
    setError("");
  }

  if (isLoading) return null;

  return (
    <main className={styles.main}>
      <div className={styles.orb1} />
      <div className={styles.orb2} />
      <div id="recaptcha-container" />

      <div className={styles.content}>
        {/* Header */}
        <div className={`${styles.header} animate-fade-up`}>
          <Link href="/add-pg" className={styles.backBtn} id="btn-back">
            ← Back
          </Link>
          <div className={styles.logo}>
            <span className={styles.logoPG}>PG</span>
            <span className={styles.logoDash}>-</span>
            <span className={styles.logoEG}>EG</span>
          </div>
        </div>

        {step === "details" ? (
          <form onSubmit={handleSendOTP} className={`${styles.form} animate-fade-up delay-1`}>
            <div className={styles.titleBlock}>
              <h2 className={styles.title}>Welcome 👋</h2>
              <p className={styles.subtitle}>
                Enter your details to sign in or create your account.
              </p>
            </div>

            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="input-name">Your Name</label>
                <input
                  id="input-name"
                  type="text"
                  className={styles.input}
                  placeholder="e.g. Rajesh Kumar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  disabled={sending}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="input-phone">Mobile Number</label>
                <div className={styles.phoneRow}>
                  <div className={styles.countryCode}>🇮🇳 +91</div>
                  <input
                    id="input-phone"
                    type="tel"
                    className={`${styles.input} ${styles.phoneInput}`}
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    autoComplete="tel"
                    inputMode="numeric"
                    disabled={sending}
                  />
                </div>
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className={styles.primaryBtn} id="btn-send-otp" disabled={sending}>
              {sending ? (
                <span className={styles.btnLoading}>
                  <span className={styles.spinner} /> Sending OTP…
                </span>
              ) : "Send OTP →"}
            </button>

            <p className={styles.note}>
              We&apos;ll send a 6-digit code to verify your number. No spam, ever.
            </p>
          </form>
        ) : (
          <div className={`${styles.form} animate-fade-up`}>
            <div className={styles.titleBlock}>
              <h2 className={styles.title}>Enter OTP</h2>
              <p className={styles.subtitle}>
                We sent a 6-digit code to <strong>+91 {phone}</strong>
              </p>
            </div>

            <div className={styles.otpRow}>
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => { otpRefs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  className={`${styles.otpBox} ${digit ? styles.otpBoxFilled : ""}`}
                  value={digit}
                  onChange={(e) => handleOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(i, e)}
                  disabled={verifying}
                  id={`otp-${i}`}
                />
              ))}
            </div>

            {verifying && (
              <div className={styles.verifyingState}>
                <span className={styles.spinner} /> Verifying…
              </div>
            )}

            {error && <p className={styles.error}>{error}</p>}

            <button
              className={styles.primaryBtn}
              onClick={() => handleVerifyOTP()}
              disabled={otp.join("").length !== 6 || verifying}
              id="btn-verify-otp"
            >
              Verify & Continue →
            </button>

            <div className={styles.resendRow}>
              {countdown > 0 ? (
                <span className={styles.resendTimer}>Resend OTP in {countdown}s</span>
              ) : (
                <button className={styles.resendBtn} onClick={handleResendOTP} id="btn-resend-otp">
                  Resend OTP
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
