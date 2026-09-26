import nodemailer from "nodemailer";
import { Resend } from "resend";
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
    if (!user || !pass) throw new ExternalError("email", null, "GMAIL_USER / GMAIL_APP_PASSWORD not set");
    const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
    const info = await withRetry("gmail", () => transport.sendMail({
      from: process.env.EMAIL_FROM || `Carryover Demo Clinic <${user}>`,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      attachments: [{ filename: mail.attachment.filename, content: mail.attachment.content, contentType: "application/pdf" }],
    }));
    return { provider, id: info.messageId ?? null };
  }

  if (!process.env.RESEND_API_KEY) throw new ExternalError("email", null, "RESEND_API_KEY not set");
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
