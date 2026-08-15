import { createAdminClient, emailsForUserIds } from "@/lib/auth-admin";

const SITE_NAME = "ESL on the Plaza";

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://esl-citi-plaza.onrender.com"
  ).replace(/\/$/, "");
}

function fromAddress() {
  return (
    process.env.EMAIL_FROM || "ESL on the Plaza <beth.t@example.com>"
  );
}

function parseEmailList(value: string | undefined) {
  return (value || "")
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.includes("@"));
}

async function approvalNotifyEmails() {
  const emails = new Set(parseEmailList(process.env.APPROVAL_NOTIFY_EMAIL));

  const admin = createAdminClient();
  if (admin) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "tech")
      .eq("status", "approved");
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
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false as const, error: "RESEND_API_KEY is not set" };
  }
  if (input.to.length === 0) {
    return { sent: false as const, error: "No recipients" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { sent: false as const, error: body.slice(0, 300) };
  }

  return { sent: true as const };
}

export async function sendApprovedWelcomeEmail(to: string, name: string) {
  const loginUrl = `${siteUrl()}/login`;
  const first = name.trim().split(/\s+/)[0] || "there";

  return sendResendEmail({
    to: [to],
    subject: `Welcome to ${SITE_NAME}! Your membership has been approved.`,
    html: `
        <p>Hi ${escapeHtml(first)},</p>
        <p>Welcome to ${SITE_NAME}! Your membership has been approved.</p>
        <p><a href="${loginUrl}">Log in</a></p>
      `,
    text: `Hi ${first},\n\nWelcome to ${SITE_NAME}! Your membership has been approved.\n\nLog in: ${loginUrl}\n`,
  });
}

export async function sendNewApplicationNotice(input: {
  name: string;
  email: string;
  requestedRole: string;
}) {
  try {
    const to = await approvalNotifyEmails();
    const approvalsUrl = `${siteUrl()}/tech`;
    const role =
      input.requestedRole === "teacher" ? "Teacher" : "Student";

    return await sendResendEmail({
      to,
      subject: `New ${SITE_NAME} application: ${input.name}`,
      html: `
        <p>Someone applied to join ${SITE_NAME}.</p>
        <p>
          <strong>Name:</strong> ${escapeHtml(input.name)}<br />
          <strong>Email:</strong> ${escapeHtml(input.email)}<br />
          <strong>Role:</strong> ${escapeHtml(role)}
        </p>
        <p>They still need to confirm their email before you can approve them.</p>
        <p><a href="${approvalsUrl}">Open Approvals</a></p>
      `,
      text: `Someone applied to join ${SITE_NAME}.\n\nName: ${input.name}\nEmail: ${input.email}\nRole: ${role}\n\nThey still need to confirm their email before you can approve them.\n\nApprovals: ${approvalsUrl}\n`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mail failed";
    return { sent: false as const, error: message };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
