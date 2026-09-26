import tls from "node:tls";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { ApiError } from "@/lib/api";
import { ExternalError, withRetry } from "@/lib/http";

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  attachment: { filename: string; content: Buffer };
}

/** Sends via Gmail SMTP (app password) by default; EMAIL_PROVIDER=resend uses Resend. Server only. */
export async function sendEmail(mail: OutgoingEmail): Promise<{ provider: string; id: string | null }> {
  const provider = process.env.EMAIL_PROVIDER === "resend" ? "resend" : "gmail";
  if (provider === "gmail") {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) throw new ApiError(503, "Email isn't configured: set GMAIL_USER and GMAIL_APP_PASSWORD in .env.local");
    // Port 587 + STARTTLS, trusting Node's bundled CAs plus the OS certificate store. Antivirus "mail shields"
    // (e.g. AVG) re-sign SMTP traffic with a root they install into Windows; on port 465 AVG's scanner fails and
    // presents an untrusted root instead. Verification stays on: only certificates the OS already trusts pass.
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 587, secure: false, requireTLS: true, auth: { user, pass },
      tls: { ca: [...tls.getCACertificates("default"), ...tls.getCACertificates("system")] },
    });
    const info = await withRetry("gmail", () => transport.sendMail({
      from: process.env.EMAIL_FROM || `Carryover Demo Clinic <${user}>`,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      attachments: [{ filename: mail.attachment.filename, content: mail.attachment.content, contentType: "application/pdf" }],
    })).catch((err: { code?: string; message?: string }) => {
      if (err.code === "EAUTH") throw new ApiError(502, "Gmail rejected the login: create a new app password for GMAIL_USER (2-Step Verification must be on)");
      throw new ApiError(502, `Email failed: ${err.message ?? "unknown error"}`);
    });
    return { provider, id: info.messageId ?? null };
  }

  if (!process.env.RESEND_API_KEY) throw new ApiError(503, "Email isn't configured: set RESEND_API_KEY in .env.local");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const res = await withRetry("resend", async () => {
    const r = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Carryover <onboarding@resend.dev>",
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      attachments: [{ filename: mail.attachment.filename, content: mail.attachment.content }],
    });
    if (r.error) throw new ExternalError("resend", (r.error as { statusCode?: number }).statusCode ?? null, r.error.message);
    return r.data;
  });
  return { provider, id: res?.id ?? null };
}
