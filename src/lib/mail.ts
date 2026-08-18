import { resolve4 } from "node:dns/promises";
import { isIP } from "node:net";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { createAdminClient, emailsForUserIds } from "@/lib/auth-admin";
import { publicSiteUrl } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/site-name";

const TECH_NOTIFY_EMAIL = "plazaenglishgroup@gmail.com";
const RESEND_TEST_FROM = `${SITE_NAME} <onboarding@resend.dev>`;
const PUBLIC_MAIL_HOSTS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
]);

function smtpNetError(error: unknown) {
  const err =
    error && typeof error === "object"
      ? (error as {
          message?: string;
          code?: string;
          errno?: number;
          syscall?: string;
          address?: string;
        })
      : {};
  return {
    message: err.message || "SMTP send failed",
    code: err.code,
    errno: err.errno,
    syscall: err.syscall,
    address: err.address,
  };
}

function siteUrl() {
  return publicSiteUrl();
}

function emailHost(value: string) {
  const boxed = value.match(/<([^>]+)>/);
  const email = (boxed?.[1] || value).trim().toLowerCase();
  return email.split("@")[1] || "";
}

function fromAddress() {
  const raw = process.env.EMAIL_FROM?.trim();
  if (!raw) return RESEND_TEST_FROM;
  const host = emailHost(raw);
  if (!host || PUBLIC_MAIL_HOSTS.has(host)) return RESEND_TEST_FROM;
  return raw;
}

export function friendlyMailError(raw: string | undefined) {
  const text = raw || "Email was not sent";
  if (/domain is not verified|not verified/i.test(text)) {
    return "Resend rejected the sender. Do not put Gmail in EMAIL_FROM — leave it empty, or use a domain verified in Resend.";
  }
  if (/only send testing emails|you can only send/i.test(text)) {
    return "Resend test mode can only send to the email that owns the Resend account.";
  }
  return text.slice(0, 280);
}

function parseEmailList(value: string | undefined) {
  return (value || "")
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.includes("@"));
}

async function approvalNotifyEmails() {
  const emails = new Set(parseEmailList(process.env.APPROVAL_NOTIFY_EMAIL));
  emails.add(TECH_NOTIFY_EMAIL);

  const admin = createAdminClient();
  if (admin) {
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "tech")
      .eq("status", "approved");
    if (error) {
      console.error("[mail] tech profiles", error.message);
    }
    const ids = (data ?? []).map((row) => row.id);
    const map = await emailsForUserIds(ids);
    for (const email of map.values()) emails.add(email.toLowerCase());
  }

  return [...emails];
}

async function sendResendEmail(input: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false as const, error: "RESEND_API_KEY is not set" };
  }
  if (input.to.length === 0) {
    return {
      sent: false as const,
      error: "No Tech email found (needs SUPABASE_SERVICE_ROLE_KEY)",
    };
  }

  let lastError = "";
  let sentCount = 0;

  for (const to of input.to) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      try {
        const parsed = JSON.parse(body) as { message?: string };
        lastError = parsed.message || body.slice(0, 400);
      } catch {
        lastError = body.slice(0, 400);
      }
      console.error("[mail] Resend rejected", to, lastError);
      continue;
    }
    console.info("[mail] Resend accepted", to);
    sentCount += 1;
  }

  if (sentCount === 0) {
    return { sent: false as const, error: lastError || "Resend did not send" };
  }
  return { sent: true as const };
}

async function sendSmtpEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !user || !pass) {
    return { sent: false as const, error: "SMTP is not configured" };
  }

  const from =
    process.env.SMTP_FROM?.trim() || `${SITE_NAME} <${user}>`;

  let connectHost = host;
  if (!isIP(host)) {
    try {
      const ipv4 = await resolve4(host);
      if (!ipv4[0]) {
        return { sent: false as const, error: `No IPv4 address for ${host}` };
      }
      connectHost = ipv4[0];
    } catch (error) {
      const details = smtpNetError(error);
      console.error("[mail] SMTP DNS failed", details);
      return {
        sent: false as const,
        error: details.message.slice(0, 280),
      };
    }
  }

  const smtpOptions: SMTPTransport.Options = {
    host: connectHost,
    port,
    secure: false,
    requireTLS: true,
    auth: { user, pass },
    tls: { servername: "smtp.gmail.com" },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  };
  const transporter = nodemailer.createTransport(smtpOptions);
  try {
    await transporter.sendMail({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
    return { sent: true as const };
  } catch (error) {
    const details = smtpNetError(error);
    console.error("[mail] SMTP failed", details);
    return { sent: false as const, error: details.message.slice(0, 280) };
  } finally {
    transporter.close();
  }
}

export async function getApplicationNoticeStatus() {
  const hasKey = Boolean(process.env.RESEND_API_KEY?.trim());
  const hasSmtp = Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim(),
  );
  const hasServiceRole = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const recipients = await approvalNotifyEmails();
  return {
    hasKey,
    hasSmtp,
    hasServiceRole,
    from: fromAddress(),
    recipients,
    ready: (hasSmtp || hasKey) && recipients.length > 0,
  };
}

export async function sendApprovedWelcomeEmail(to: string, _name: string) {
  const loginUrl = `${siteUrl()}/login`;

  return sendSmtpEmail({
    to,
    subject: `Your ${SITE_NAME} account is approved`,
    html: `
        <p><strong>Welcome to ${SITE_NAME}!</strong></p>
        <p>Your account has been approved.</p>
        <p>You can now log in, sign up for classes, use the community chat, and complete your profile.</p>
        <p><a href="${loginUrl}">Log in</a></p>
      `,
    text: `Welcome to ${SITE_NAME}!\n\nYour account has been approved.\n\nYou can now log in, sign up for classes, use the community chat, and complete your profile.\n\nLog in: ${loginUrl}\n`,
  });
}

export async function sendNewApplicationNotice(input: {
  name: string;
  email: string;
  requestedRole: string;
  hometown?: string;
  heardFrom?: string;
}) {
  try {
    const to = [TECH_NOTIFY_EMAIL];
    console.info("[mail] application notice recipients", to);
    const approvalsUrl = `${siteUrl()}/tech`;
    const hometown = input.hometown?.trim() || "";
    const heardFrom = input.heardFrom?.trim() || "";
    const extraHtml = [
      hometown ? `<p>From: ${escapeHtml(hometown)}</p>` : "",
      heardFrom
        ? `<p>How they heard about us: ${escapeHtml(heardFrom)}</p>`
        : "",
    ]
      .filter(Boolean)
      .join("");
    const extraText = [
      hometown ? `From: ${hometown}` : "",
      heardFrom ? `How they heard about us: ${heardFrom}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const html = `
        <p>${escapeHtml(input.name)} has requested to join ${SITE_NAME}.</p>
        <p>Email: ${escapeHtml(input.email)}</p>
        ${extraHtml}
        <p><a href="${approvalsUrl}">Open Approvals</a></p>
      `;
    const text = [
      `${input.name} has requested to join ${SITE_NAME}.`,
      `Email: ${input.email}`,
      extraText,
      `Approvals: ${approvalsUrl}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const result = await sendResendEmail({
      to,
      subject: "New member request",
      html,
      text: `${text}\n`,
    });
    if (result.sent) return result;

    console.error("[mail] application notice Resend failed", result.error);
    return {
      sent: false as const,
      error: friendlyMailError(result.error),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mail failed";
    console.error("[mail] application notice", message);
    return { sent: false as const, error: friendlyMailError(message) };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
