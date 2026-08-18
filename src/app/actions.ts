"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEnrollNow, CLASS_CAPACITY, CLASS_FULL_MESSAGE, isPlazaCalendarClass } from "@/lib/enrollment";
import {
  createPendingMember,
  getDemoMembers,
  getDemoSessionProfile,
  hasDemoSession,
  saveDemoMembers,
  setDemoSession,
  useLocalDemo,
} from "@/lib/demo";
import {
  buildDemoClasses,
  getDemoClassesWithEnrollments,
  getDemoEnrollmentIds,
  saveDemoEnrollmentIds,
} from "@/lib/demo-classes";
import { findOrCreateClassId } from "@/lib/ensure-classes";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { EmailOtpType } from "@supabase/supabase-js";
import { emailForUserId, authEmailExists, createAdminClient } from "@/lib/auth-admin";
import { sendApprovedWelcomeEmail, sendNewApplicationNotice } from "@/lib/mail";
import {
  MAX_INTERESTS,
  splitStoredInterests,
} from "@/lib/profile";
import {
  assignableRoles,
  canDeleteChatMessage,
  canDeleteMember,
  canEditClassSchedule,
  canManageAnnouncements,
  canManageClassTopics,
  canManageClasses,
  canManageRoles,
  canModerateAccount,
  canRemoveFromClass,
  canReviewApplications,
  canViewClassRoster,
  CHAT_ACCESS_DENIED,
} from "@/lib/roles";
import {
  CHAT_IMAGE_BUCKET,
  CHAT_IMAGE_MAX_OUT_BYTES,
  CHAT_IMAGE_PATH_RE,
  CHAT_IMAGE_SIGNED_TTL_SEC,
} from "@/lib/chat-image";
import {
  CHAT_FILE_BUCKET,
  CHAT_FILE_MAX_BYTES,
  CHAT_FILE_PATH_RE,
  sanitizeChatFileName,
} from "@/lib/chat-file";
import { DEFAULT_CLASS_LOCATION } from "@/lib/class-schedule";
import { authConfirmUrl } from "@/lib/site-url";
import { SITE_NAME } from "@/lib/site-name";
import type { AnnouncementRow, ClassTopicRow, Profile, Role } from "@/lib/types";
import {
  getDemoAnnouncements,
  saveDemoAnnouncements,
} from "@/lib/demo-announcements";
import {
  getDemoClassTopics,
  saveDemoClassTopics,
} from "@/lib/demo-class-topics";
import {
  CLASS_TOPIC_CONTENT_MAX,
  CLASS_TOPIC_TITLE_MAX,
} from "@/lib/class-topics";
import {
  looksLikeTopicHtml,
  sanitizeTopicHtml,
  topicContentPlainLength,
} from "@/lib/topic-html";
import {
  EXISTING_ACCOUNT_MESSAGE,
  emailFormatError,
  isExistingAccountError,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  registrationEmailError,
} from "@/lib/email";

export type ActionState = {
  error?: string;
  success?: string;
  tempPassword?: string;
  imageUrls?: Record<string, string>;
  message?: {
    id: string;
    user_id: string;
    body: string;
    created_at: string;
    is_announcement: boolean;
    image_path?: string | null;
    image_width?: number | null;
    image_height?: number | null;
    imageUrl?: string | null;
    file_path?: string | null;
    file_name?: string | null;
    fileUrl?: string | null;
  };
} | null;

function classDbError(message: string) {
  if (/column .*location.* does not exist/i.test(message)) {
    return "Run supabase/class-location-upgrade.sql in the Supabase SQL Editor, then try again.";
  }
  return message;
}

function looksLikeEmail(value: string) {
  return value.includes("@");
}

async function resolveLoginEmail(login: string): Promise<
  { email: string } | { error: string }
> {
  const trimmed = login.trim();
  if (!trimmed) return { error: "Enter email or display name" };
  if (looksLikeEmail(trimmed)) {
    return { email: trimmed.toLowerCase() };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { error: "Display name login needs SUPABASE_SERVICE_ROLE_KEY" };
  }

  const admin = createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: matches, error } = await admin
    .from("profiles")
    .select("id, display_name")
    .ilike("display_name", trimmed);

  if (error) return { error: error.message };
  if (!matches?.length) {
    return { error: "No account with that display name" };
  }
  if (matches.length > 1) {
    return { error: "Several people share that name — use your email" };
  }

  const { data: userData, error: userError } =
    await admin.auth.admin.getUserById(matches[0].id);
  if (userError || !userData.user?.email) {
    return { error: "Could not find login email for that name" };
  }

  return { email: userData.user.email };
}

export async function signIn(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const login = String(formData.get("login") || formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/");

  if (!login || !password) {
    return { error: "Enter email or display name, and password" };
  }

  if (useLocalDemo()) {
    const members = await getDemoMembers();
    const key = login.toLowerCase();
    const match = members.find(
      (m) =>
        m.password === password &&
        (m.email?.toLowerCase() === key ||
          m.display_name.toLowerCase() === key),
    );
    if (!match) {
      return { error: "Invalid login or password" };
    }
    await setDemoSession(match.id);
    revalidatePath("/", "layout");
    if (match.status === "suspended") {
      redirect("/suspended");
    }
    if (match.status !== "approved") {
      redirect("/pending");
    }
    const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/";
    return { success: dest };
  }

  const resolved = await resolveLoginEmail(login);
  if ("error" in resolved) return { error: resolved.error };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: resolved.email,
    password,
  });
  if (error) {
    const raw = error.message.toLowerCase();
    if (raw.includes("email not confirmed") || raw.includes("not confirmed")) {
      return {
        error:
          "Please confirm your email first. Open the link we sent you, then log in.",
      };
    }
    return { error: error.message };
  }

  const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  revalidatePath("/", "layout");
  revalidatePath(dest);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  if (profile?.status === "suspended") {
    redirect("/suspended");
  }
  if (profile?.status !== "approved") {
    redirect("/pending");
  }

  return { success: dest };
}

export async function signUp(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = normalizeEmail(String(formData.get("email") || ""));
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm_password") || "");
  const displayName = String(formData.get("display_name") || "").trim();
  const hometown = String(formData.get("hometown") || "").trim().slice(0, 80);
  const heardFrom = String(formData.get("heard_from") || "").trim().slice(0, 160);

  if (!email || !password || !displayName) {
    return { error: "Please fill in all fields" };
  }
  const emailError = registrationEmailError(email);
  if (emailError) return { error: emailError };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match" };
  }

  if (useLocalDemo()) {
    const members = await getDemoMembers();
    if (members.some((m) => m.email?.toLowerCase() === email)) {
      return { error: EXISTING_ACCOUNT_MESSAGE };
    }
    const member = createPendingMember({
      displayName,
      email,
      password,
      requestedRole: "student",
      hometown,
      heardFrom,
    });
    await saveDemoMembers([...members, member]);
    await setDemoSession(member.id);
    redirect("/pending");
  }

  const exists = await authEmailExists(email);
  if (exists) return { error: EXISTING_ACCOUNT_MESSAGE };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: authConfirmUrl(),
      data: {
        display_name: displayName,
        requested_role: "student",
        hometown,
        heard_from: heardFrom,
      },
    },
  });

  if (error) {
    if (isExistingAccountError(error.message)) {
      return { error: EXISTING_ACCOUNT_MESSAGE };
    }
    return { error: error.message };
  }

  if (data.user?.identities && data.user.identities.length === 0) {
    return { error: EXISTING_ACCOUNT_MESSAGE };
  }

  if (data.user) {
    const admin = createAdminClient();
    if (admin) {
      const { error: extraError } = await admin
        .from("profiles")
        .update({ hometown, heard_from: heardFrom })
        .eq("id", data.user.id);
      if (extraError) {
        console.error("[signup] application fields", extraError.message);
      }
    }
  }

  if (!data.session) {
    redirect(`/register/check-email?email=${encodeURIComponent(email)}`);
  }

  const mail = await sendNewApplicationNotice({
    name: displayName,
    email,
    requestedRole: "student",
  });
  if (!mail.sent) {
    console.error("[signup] application notice not sent", mail.error);
  }

  redirect("/pending");
}

export async function notifyConfirmedApplication(userHint?: {
  id: string;
  email?: string | null;
}) {
  try {
    let userId = userHint?.id;
    let email = userHint?.email || undefined;

    if (!userId || !email) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = userId || user?.id;
      email = email || user?.email;
    }

    if (!userId) {
      console.error("[confirm] application notice skipped: no user");
      return { sent: false as const };
    }
    if (!email) {
      email = (await emailForUserId(userId)) || undefined;
    }
    if (!email) {
      console.error("[confirm] application notice skipped: no email", userId);
      return { sent: false as const };
    }

    const admin = createAdminClient();
    const db = admin ?? (await createClient());
    let profile: {
      display_name: string;
      status: string;
      requested_role: string | null;
      hometown?: string | null;
      heard_from?: string | null;
    } | null = null;
    const full = await db
      .from("profiles")
      .select("display_name, status, requested_role, hometown, heard_from")
      .eq("id", userId)
      .maybeSingle();
    if (full.error) {
      console.error("[confirm] profile lookup", full.error.message);
      const basic = await db
        .from("profiles")
        .select("display_name, status, requested_role")
        .eq("id", userId)
        .maybeSingle();
      profile = basic.data;
    } else {
      profile = full.data;
    }
    if (profile && profile.status !== "pending") {
      console.error("[confirm] application notice skipped: not pending", userId);
      return { sent: false as const };
    }

    const mail = await sendNewApplicationNotice({
      name: profile?.display_name || email.split("@")[0],
      email,
      requestedRole: profile?.requested_role || "student",
      hometown: profile?.hometown ?? undefined,
      heardFrom: profile?.heard_from ?? undefined,
    });
    if (!mail.sent) {
      console.error("[confirm] application notice not sent", mail.error);
    }
    return mail;
  } catch (error) {
    console.error("[confirm] application notice", error);
    return { sent: false as const };
  }
}

const JOIN_CONFIRM_TYPES = new Set<EmailOtpType>([
  "signup",
  "email",
  "invite",
  "magiclink",
]);

export async function confirmEmailFromLink(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tokenHash = String(formData.get("token_hash") || "").trim();
  const code = String(formData.get("code") || "").trim();
  const rawType = String(formData.get("type") || "email") as EmailOtpType;

  if (!tokenHash && !code) {
    return {
      error:
        "This confirmation link is missing. Open the newest email we sent you.",
    };
  }

  const supabase = await createClient();
  let confirmedUser: { id: string; email?: string | null } | null = null;

  if (tokenHash) {
    const types = [...new Set<EmailOtpType>(["email", "signup", rawType])];
    let verified = false;
    for (const type of types) {
      if (!JOIN_CONFIRM_TYPES.has(type)) continue;
      const { data, error } = await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
      if (!error) {
        verified = true;
        const user = data.user ?? data.session?.user;
        if (user) {
          confirmedUser = { id: user.id, email: user.email };
        }
        break;
      }
      const lower = error.message.toLowerCase();
      if (
        lower.includes("expired") ||
        lower.includes("already") ||
        lower.includes("used")
      ) {
        break;
      }
    }
    if (!verified) {
      return {
        error:
          "This confirmation link is invalid, expired, or was already used. If you already confirmed, log in and wait for approval.",
      };
    }
  } else {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return {
        error:
          "This confirmation link is invalid, expired, or was already used. If you already confirmed, log in and wait for approval.",
      };
    }
    const user = data.user ?? data.session?.user;
    if (user) {
      confirmedUser = { id: user.id, email: user.email };
    }
  }

  if (!confirmedUser) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) confirmedUser = { id: user.id, email: user.email };
  }

  const mail = await notifyConfirmedApplication(confirmedUser ?? undefined);
  if (!mail.sent) {
    console.error("[confirm] Tech notice did not send before confirm page");
  }
  return { success: "confirmed" };
}

export async function resendConfirmationEmail(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = normalizeEmail(String(formData.get("email") || ""));
  const emailError = emailFormatError(email);
  if (emailError) return { error: emailError };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: authConfirmUrl() },
  });
  if (error) {
    console.error("[resend confirmation]", error.message);
    return {
      error: "Could not send another email just now. Check spam, or try again later.",
    };
  }
  return { success: "If an account exists, we sent another confirmation email." };
}

export async function sendTestApplicationNotice(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();
  if (!me || me.status !== "approved" || me.role !== "tech") {
    return { error: "Only Tech can send a test email" };
  }

  const mail = await sendNewApplicationNotice({
    name: "Test applicant",
    email: "test@example.com",
    requestedRole: "student",
  });
  if (!mail.sent) return { error: mail.error || "Test email was not sent" };
  return { success: `Test email sent. Check inbox (and spam) for ${SITE_NAME}.` };
}

function generateTempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function addMemberManually(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const displayName = String(formData.get("display_name") || "").trim();
  const email = normalizeEmail(String(formData.get("email") || ""));
  let role = String(formData.get("role") || "student") as Role;

  if (!displayName) return { error: "Please enter a name" };
  if (displayName.length > 60) return { error: "Please use a shorter name" };
  const emailError = registrationEmailError(email);
  if (emailError) return { error: emailError };

  const tempPassword = generateTempPassword();
  const now = new Date().toISOString();

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || !canReviewApplications(me.role) || me.status !== "approved") {
      return { error: "You cannot add members" };
    }
    if (!canManageRoles(me.role)) {
      role = "student";
    } else if (!assignableRoles().includes(role)) {
      return { error: "Choose Student, Teacher, or Admin" };
    }
    const members = await getDemoMembers();
    if (members.some((m) => m.email?.toLowerCase() === email)) {
      return { error: EXISTING_ACCOUNT_MESSAGE };
    }
    const member = createPendingMember({
      displayName,
      email,
      password: tempPassword,
      requestedRole: "student",
    });
    member.status = "approved";
    member.role = role;
    member.reviewed_at = now;
    member.reviewed_by = me.id;
    await saveDemoMembers([member, ...members]);
    revalidatePath("/members");
    return {
      success: `${displayName} was added as a ${role}. Give them this password so they can log in.`,
      tempPassword,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };

  const { data: me } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", user.id)
    .single();
  if (!me || !canReviewApplications(me.role) || me.status !== "approved") {
    return { error: "You cannot add members" };
  }
  if (!canManageRoles(me.role)) {
    role = "student";
  } else if (!assignableRoles().includes(role)) {
    return { error: "Choose Student, Teacher, or Admin" };
  }

  const exists = await authEmailExists(email);
  if (exists) return { error: EXISTING_ACCOUNT_MESSAGE };

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Adding members needs SUPABASE_SERVICE_ROLE_KEY in Vercel" };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      requested_role: "student",
    },
  });
  if (createError) {
    if (isExistingAccountError(createError.message)) {
      return { error: EXISTING_ACCOUNT_MESSAGE };
    }
    return { error: createError.message };
  }
  const newId = created.user?.id;
  if (!newId) return { error: "Could not create the account" };

  const profilePayload = {
    id: newId,
    display_name: displayName,
    requested_role: "student" as const,
    role,
    status: "approved" as const,
    reviewed_at: now,
    reviewed_by: user.id,
  };

  const { data: saved, error: profileError } = await admin
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" })
    .select("id, status")
    .maybeSingle();

  if (profileError || !saved || saved.status !== "approved") {
    await admin.auth.admin.deleteUser(newId);
    if (profileError) {
      const raw = profileError.message.toLowerCase();
      if (raw.includes("duplicate") || raw.includes("already exists")) {
        return { error: EXISTING_ACCOUNT_MESSAGE };
      }
      return { error: profileError.message };
    }
    return { error: "Could not finish setting up the new account" };
  }

  revalidatePath("/members");
  revalidatePath("/");
  return {
      success: `${displayName} was added as a ${role}. Give them this password so they can log in.`,
    tempPassword,
  };
}

export async function reviewApplication(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = String(formData.get("user_id") || "");
  const decision = String(formData.get("decision") || "");

  if (!userId || !["approve", "reject"].includes(decision)) {
    return { error: "Invalid application" };
  }

  if (useLocalDemo()) {
    const me = await getDemoSessionProfile();
    if (!me || !canReviewApplications(me.role) || me.status !== "approved") {
      return { error: "You cannot review applications" };
    }
    const members = await getDemoMembers();
    const target = members.find((m) => m.id === userId);
    if (!target) return { error: "Application not found" };
    if (target.status !== "pending") {
      return { error: "This application is no longer pending" };
    }
    if (target?.role === "tech") {
      return { error: "Cannot change a Tech account" };
    }
    const next = members.map((m) => {
      if (m.id !== userId) return m;
      return {
        ...m,
        status: decision === "approve" ? ("approved" as const) : ("rejected" as const),
        role: decision === "approve" ? ("student" as const) : m.role,
        reviewed_at: new Date().toISOString(),
        reviewed_by: me.id,
      };
    });
    await saveDemoMembers(next);
    revalidatePath("/members");
    revalidatePath("/pending");
    return {
      success:
        decision === "approve"
          ? "Approved (demo — no email sent)"
          : "Application declined",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };

  const { data: me } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  if (!me || !canReviewApplications(me.role) || me.status !== "approved") {
    return { error: "You cannot review applications" };
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { error: "Application not found" };
  if (target.status !== "pending") {
    return { error: "This application is no longer pending" };
  }
  if (target.role === "tech") {
    return { error: "Cannot change a Tech account" };
  }

  const payload =
    decision === "approve"
      ? {
          status: "approved" as const,
          role: "student" as const,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        }
      : {
          status: "rejected" as const,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        };

  const { data: updated, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!updated) return { error: "This application is no longer pending" };

  if (decision === "approve") {
    const email = await emailForUserId(userId);
    const { data: person } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    revalidatePath("/members");
    revalidatePath("/pending");
    if (email) {
      const name = person?.display_name || "there";
      after(async () => {
        const mail = await sendApprovedWelcomeEmail(email, name);
        if (!mail.sent) {
          console.error("[approve] approval email not sent", mail.error);
        }
      });
    } else {
      console.error("[approve] no email for", userId);
    }
    return { success: "Approved. We emailed them a welcome note." };
  }

  revalidatePath("/members");
  revalidatePath("/pending");
  return { success: "Application declined" };
}

export async function deleteMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = String(formData.get("user_id") || "");
  if (!userId) return { error: "Missing user" };

  if (useLocalDemo()) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved") {
      return { error: "Please log in" };
    }
    const members = await getDemoMembers();
    const target = members.find((m) => m.id === userId);
    if (!target) return { error: "Account not found" };
    if (!canDeleteMember(me, target)) {
      return { error: "You cannot delete this account" };
    }
    await saveDemoMembers(members.filter((m) => m.id !== userId));
    revalidatePath("/members");
    return { success: "Account deleted" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };

  const { data: me } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();

  if (!me || me.status !== "approved") {
    return { error: "Please log in" };
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { error: "Account not found" };
  if (!canDeleteMember({ id: user.id, role: me.role }, target)) {
    return { error: "You cannot delete this account" };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    // Soft-block without service role: reject + keep out of chat
    const { error } = await supabase
      .from("profiles")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq("id", userId);
    if (error) return { error: error.message };
    revalidatePath("/members");
    return {
      success: "Account blocked (add SUPABASE_SERVICE_ROLE_KEY to fully delete)",
    };
  }

  const admin = createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  revalidatePath("/members");
  return { success: "Account deleted" };
}

function revalidateMemberPaths() {
  revalidatePath("/members");
  revalidatePath("/", "layout");
  revalidatePath("/chat");
  revalidatePath("/suspended");
  revalidatePath("/pending");
}

export async function setMemberRole(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = String(formData.get("user_id") || "");
  const role = String(formData.get("role") || "") as Role;
  if (!userId) return { error: "Missing user" };
  if (!assignableRoles().includes(role)) {
    return { error: "That role cannot be assigned here" };
  }

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved" || !canManageRoles(me.role)) {
      return { error: "Only Tech can change roles" };
    }
    if (me.id === userId) return { error: "You cannot change your own role" };
    const members = await getDemoMembers();
    const target = members.find((m) => m.id === userId);
    if (!target) return { error: "Account not found" };
    if (target.role === "tech") return { error: "Cannot change a Tech account" };
    await saveDemoMembers(
      members.map((m) => (m.id === userId ? { ...m, role } : m)),
    );
    revalidateMemberPaths();
    return { success: "Role updated" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", user.id)
    .single();
  if (!me || me.status !== "approved" || !canManageRoles(me.role)) {
    return { error: "Only Tech can change roles" };
  }
  if (me.id === userId) return { error: "You cannot change your own role" };

  const { data: target } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { error: "Account not found" };
  if (target.role === "tech") return { error: "Cannot change a Tech account" };
  if (target.status !== "approved" && target.status !== "suspended") {
    return { error: "Approve the application first" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);
  if (error) return { error: error.message };
  revalidateMemberPaths();
  return { success: "Role updated" };
}

export async function setMemberMuted(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = String(formData.get("user_id") || "");
  const muted = String(formData.get("muted") || "") === "true";
  if (!userId) return { error: "Missing user" };

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved") return { error: "Please log in" };
    const members = await getDemoMembers();
    const target = members.find((m) => m.id === userId);
    if (!target) return { error: "Account not found" };
    if (!canModerateAccount(me.role, target.role)) {
      return { error: "You cannot mute this person" };
    }
    await saveDemoMembers(
      members.map((m) => (m.id === userId ? { ...m, muted } : m)),
    );
    revalidateMemberPaths();
    return { success: muted ? "Community Chat access removed" : "Community Chat access restored" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", user.id)
    .single();
  if (!me || me.status !== "approved") return { error: "Please log in" };

  const { data: target } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { error: "Account not found" };
  if (!canModerateAccount(me.role, target.role)) {
    return { error: "You cannot mute this person" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ muted })
    .eq("id", userId);
  if (error) return { error: error.message };
  revalidateMemberPaths();
  return { success: muted ? "Community Chat access removed" : "Community Chat access restored" };
}

export async function setMemberSuspended(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = String(formData.get("user_id") || "");
  const suspend = String(formData.get("suspend") || "") === "true";
  if (!userId) return { error: "Missing user" };

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved") return { error: "Please log in" };
    const members = await getDemoMembers();
    const target = members.find((m) => m.id === userId);
    if (!target) return { error: "Account not found" };
    if (!canModerateAccount(me.role, target.role)) {
      return { error: "You cannot suspend this person" };
    }
    const nextStatus = suspend ? ("suspended" as const) : ("approved" as const);
    if (suspend && target.status !== "approved") {
      return { error: "Only an approved member can be suspended" };
    }
    if (!suspend && target.status !== "suspended") {
      return { error: "This account is not suspended" };
    }
    await saveDemoMembers(
      members.map((m) => (m.id === userId ? { ...m, status: nextStatus } : m)),
    );
    revalidateMemberPaths();
    return { success: suspend ? "Account suspended" : "Access restored" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", user.id)
    .single();
  if (!me || me.status !== "approved") return { error: "Please log in" };

  const { data: target } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { error: "Account not found" };
  if (!canModerateAccount(me.role, target.role)) {
    return { error: "You cannot suspend this person" };
  }
  if (suspend && target.status !== "approved") {
    return { error: "Only an approved member can be suspended" };
  }
  if (!suspend && target.status !== "suspended") {
    return { error: "This account is not suspended" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ status: suspend ? "suspended" : "approved" })
    .eq("id", userId);
  if (error) return { error: error.message };
  revalidateMemberPaths();
  return { success: suspend ? "Account suspended" : "Access restored" };
}

export async function removeClassEnrollment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const classId = String(formData.get("class_id") || "");
  const userId = String(formData.get("user_id") || "");
  if (!classId || !userId) return { error: "Missing class or person" };

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved" || !canViewClassRoster(me.role)) {
      return { error: "You cannot change this sign-up" };
    }
    return { error: "Demo mode does not store named class rosters" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();
  if (!me || me.status !== "approved" || !canViewClassRoster(me.role)) {
    return { error: "You cannot change this sign-up" };
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (!target) return { error: "Account not found" };
  if (!canRemoveFromClass(me.role, target.role)) {
    return { error: "You can only remove a student from a class" };
  }

  const { error } = await supabase
    .from("enrollments")
    .delete()
    .eq("class_id", classId)
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/members");
  revalidatePath("/");
  revalidatePath("/classes");
  revalidatePath("/my");
  return { success: "Removed from this class" };
}

export async function checkChatAccess(): Promise<{ allowed: boolean }> {
  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    return {
      allowed: Boolean(me && me.status === "approved" && !me.muted),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { allowed: false };

  const { data: me } = await supabase
    .from("profiles")
    .select("status, muted")
    .eq("id", user.id)
    .maybeSingle();

  return {
    allowed: Boolean(me && me.status === "approved" && !me.muted),
  };
}

export async function signChatImagePaths(
  paths: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((path) => CHAT_IMAGE_PATH_RE.test(path)))];
  if (unique.length === 0) return {};

  if (useLocalDemo() || (await hasDemoSession())) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};
  const { data: me } = await supabase
    .from("profiles")
    .select("status, muted")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.status !== "approved" || me.muted) return {};

  const { data, error } = await supabase.storage
    .from(CHAT_IMAGE_BUCKET)
    .createSignedUrls(unique, CHAT_IMAGE_SIGNED_TTL_SEC);
  if (error || !data) return {};

  const urls: Record<string, string> = {};
  for (const row of data) {
    if (row.path && row.signedUrl) urls[row.path] = row.signedUrl;
  }
  return urls;
}

export async function signChatFilePaths(
  paths: string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter((path) => CHAT_FILE_PATH_RE.test(path)))];
  if (unique.length === 0) return {};

  if (useLocalDemo() || (await hasDemoSession())) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};
  const { data: me } = await supabase
    .from("profiles")
    .select("status, muted")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.status !== "approved" || me.muted) return {};

  const { data, error } = await supabase.storage
    .from(CHAT_FILE_BUCKET)
    .createSignedUrls(unique, CHAT_IMAGE_SIGNED_TTL_SEC);
  if (error || !data) return {};

  const urls: Record<string, string> = {};
  for (const row of data) {
    if (row.path && row.signedUrl) urls[row.path] = row.signedUrl;
  }
  return urls;
}

function looksLikeImage(bytes: Uint8Array, mime: string) {
  if (bytes.length < 12) return false;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const webp =
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (mime === "image/jpeg") return jpeg;
  if (mime === "image/png") return png;
  if (mime === "image/webp") return webp;
  return jpeg || png || webp;
}

function looksLikeTextFile(bytes: Uint8Array) {
  if (bytes.length === 0) return false;
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  if (sample.includes(0)) return false;
  return true;
}

export async function postChatMessage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const body = String(formData.get("body") || "").trim();
  const asAnnounce = String(formData.get("announce") || "") === "true";
  const image = formData.get("image");
  const textFile = formData.get("text_file");
  const hasImage = image instanceof File && image.size > 0;
  const hasFile = textFile instanceof File && textFile.size > 0;
  const width = Number(formData.get("image_width") || 0);
  const height = Number(formData.get("image_height") || 0);
  const fileName = sanitizeChatFileName(String(formData.get("file_name") || ""));

  if (hasImage && hasFile) {
    return { error: "Please send a photo or a text file, not both." };
  }
  if (!body && !hasImage && !hasFile) return { error: "Write a message first" };
  if (body.length > 2000) return { error: "Message is too long" };

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved") return { error: "Please log in" };
    if (me.muted) return { error: CHAT_ACCESS_DENIED };
    return { success: "sent" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };

  const { data: me } = await supabase
    .from("profiles")
    .select("role, status, muted")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.status !== "approved") {
    return { error: "Please log in" };
  }
  if (me.muted) return { error: CHAT_ACCESS_DENIED };

  let imagePath: string | null = null;
  let imageWidth: number | null = null;
  let imageHeight: number | null = null;
  let filePath: string | null = null;
  let storedFileName: string | null = null;

  if (hasImage && image instanceof File) {
    if (image.size > CHAT_IMAGE_MAX_OUT_BYTES) {
      return { error: "That photo is too large to send." };
    }
    const mime = image.type;
    if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
      return { error: "Please choose a JPEG, PNG, or WebP photo." };
    }
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (!looksLikeImage(bytes, mime)) {
      return { error: "That file does not look like a photo." };
    }
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 1 ||
      height < 1 ||
      width > 4000 ||
      height > 4000
    ) {
      return { error: "That photo could not be prepared." };
    }
    const ext = mime === "image/webp" ? "webp" : "jpg";
    imagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(CHAT_IMAGE_BUCKET)
      .upload(imagePath, image, {
        contentType: mime,
        upsert: false,
      });
    if (uploadError) {
      const { data: again } = await supabase
        .from("profiles")
        .select("muted")
        .eq("id", user.id)
        .maybeSingle();
      if (again?.muted) return { error: CHAT_ACCESS_DENIED };
      return { error: "Photo could not be uploaded. Please try again." };
    }
    imageWidth = Math.round(width);
    imageHeight = Math.round(height);
  }

  if (hasFile && textFile instanceof File) {
    if (textFile.size > CHAT_FILE_MAX_BYTES) {
      return { error: "That text file is too large to send." };
    }
    const mime = (textFile.type || "").toLowerCase();
    if (
      mime &&
      mime !== "text/plain" &&
      mime !== "text/markdown" &&
      mime !== "application/octet-stream"
    ) {
      return { error: "Please choose a .txt file." };
    }
    const bytes = new Uint8Array(await textFile.arrayBuffer());
    if (!looksLikeTextFile(bytes)) {
      return { error: "That file does not look like a text file." };
    }
    if (!fileName) {
      return { error: "That text file could not be prepared." };
    }
    filePath = `${user.id}/${crypto.randomUUID()}.txt`;
    storedFileName = fileName;
    const { error: uploadError } = await supabase.storage
      .from(CHAT_FILE_BUCKET)
      .upload(filePath, textFile, {
        contentType: "text/plain",
        upsert: false,
      });
    if (uploadError) {
      const { data: again } = await supabase
        .from("profiles")
        .select("muted")
        .eq("id", user.id)
        .maybeSingle();
      if (again?.muted) return { error: CHAT_ACCESS_DENIED };
      return { error: "File could not be uploaded. Please try again." };
    }
  }

  const payload: Record<string, unknown> = {
    user_id: user.id,
    body,
    is_announcement: asAnnounce,
    image_path: imagePath,
    image_width: imageWidth,
    image_height: imageHeight,
    file_path: filePath,
    file_name: storedFileName,
  };
  const { data, error } = await supabase
    .from("messages")
    .insert(payload)
    .select(
      "id, user_id, body, created_at, is_announcement, image_path, image_width, image_height, file_path, file_name",
    )
    .single();
  if (error) {
    if (imagePath) {
      await supabase.storage.from(CHAT_IMAGE_BUCKET).remove([imagePath]);
    }
    if (filePath) {
      await supabase.storage.from(CHAT_FILE_BUCKET).remove([filePath]);
    }
    const { data: again } = await supabase
      .from("profiles")
      .select("muted")
      .eq("id", user.id)
      .maybeSingle();
    if (again?.muted) return { error: CHAT_ACCESS_DENIED };
    if (/column .*file_path.* does not exist/i.test(error.message)) {
      return { error: "Run supabase/chat-files-upgrade.sql in the Supabase SQL Editor, then try again." };
    }
    return { error: "Could not send that message. Please try again." };
  }

  let imageUrl: string | null = null;
  if (data.image_path) {
    const signed = await signChatImagePaths([data.image_path]);
    imageUrl = signed[data.image_path] ?? null;
  }
  let fileUrl: string | null = null;
  if (data.file_path) {
    const signed = await signChatFilePaths([data.file_path]);
    fileUrl = signed[data.file_path] ?? null;
  }

  return {
    success: "sent",
    message: {
      id: data.id,
      user_id: data.user_id,
      body: data.body,
      created_at: data.created_at,
      is_announcement: Boolean(data.is_announcement),
      image_path: data.image_path,
      image_width: data.image_width,
      image_height: data.image_height,
      imageUrl,
      file_path: data.file_path,
      file_name: data.file_name,
      fileUrl,
    },
  };
}

export async function deleteChatMessage(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("message_id") || "");
  if (!id) return { error: "Missing message" };

  if (useLocalDemo() || (await hasDemoSession())) {
    return { success: "deleted" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("id, role, status, muted")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.status !== "approved") return { error: "Please log in" };
  if (me.muted) return { error: CHAT_ACCESS_DENIED };

  const { data: row } = await supabase
    .from("messages")
    .select("id, user_id, image_path, file_path")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Message not found" };

  const { data: author } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", row.user_id)
    .maybeSingle();
  const authorRole = (author?.role as Role) || "student";
  if (
    !canDeleteChatMessage(
      { id: me.id, role: me.role },
      { user_id: row.user_id, role: authorRole },
    )
  ) {
    return { error: "You cannot delete this message" };
  }

  const imagePath =
    typeof row.image_path === "string" && CHAT_IMAGE_PATH_RE.test(row.image_path)
      ? row.image_path
      : null;
  const filePath =
    typeof row.file_path === "string" && CHAT_FILE_PATH_RE.test(row.file_path)
      ? row.file_path
      : null;

  const admin = createAdminClient();
  const storage = admin ?? supabase;

  if (imagePath) {
    const { error: storageError } = await storage.storage
      .from(CHAT_IMAGE_BUCKET)
      .remove([imagePath]);
    if (storageError && !/not found|does not exist/i.test(storageError.message)) {
      return { error: "Could not delete that photo. Please try again." };
    }
  }
  if (filePath) {
    const { error: storageError } = await storage.storage
      .from(CHAT_FILE_BUCKET)
      .remove([filePath]);
    if (storageError && !/not found|does not exist/i.test(storageError.message)) {
      return { error: "Could not delete that file. Please try again." };
    }
  }

  const { error } = await supabase.from("messages").delete().eq("id", id);
  if (error) return { error: "Could not delete that message." };
  return { success: "deleted" };
}

export async function createClass(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const location =
    String(formData.get("location") || "").trim() || DEFAULT_CLASS_LOCATION;
  const startsAt = String(formData.get("starts_at") || "");
  const capacity = Number(formData.get("capacity") || CLASS_CAPACITY);

  if (!title || !startsAt) return { error: "Add a title and date" };
  if (!Number.isFinite(capacity) || capacity < 1 || capacity > CLASS_CAPACITY) {
    return { error: `Capacity must be between 1 and ${CLASS_CAPACITY}` };
  }

  const when = new Date(startsAt);
  const dow = when.getDay();
  if (dow !== 1 && dow !== 5) {
    return { error: "Classes can only be scheduled on Monday or Friday" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };

  const { data: me } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();
  if (!me || me.status !== "approved" || !canManageClasses(me.role)) {
    return { error: "Only Teacher or Tech can manage classes" };
  }

  const { error } = await supabase.from("classes").insert({
    title,
    description,
    location,
    starts_at: new Date(startsAt).toISOString(),
    capacity,
    created_by: user.id,
  });

  if (error) return { error: classDbError(error.message) };
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/classes");
  revalidatePath("/my");
  return { success: "Class added" };
}

export async function deleteClass(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("class_id") || "");
  if (!id) return { error: "Missing class id" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();
  if (!me || me.status !== "approved" || !canManageClasses(me.role)) {
    return { error: "Only Teacher or Tech can manage classes" };
  }

  const { error } = await supabase.from("classes").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/classes");
  revalidatePath("/my");
  return { success: "Class deleted" };
}

export async function updateClass(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("class_id") || "");
  if (!id) return { error: "Missing class id" };

  const location =
    String(formData.get("location") || "").trim() || DEFAULT_CLASS_LOCATION;
  if (location.length > 120) return { error: "Location is too long" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();
  if (!me || me.status !== "approved" || !canManageClasses(me.role)) {
    return { error: "Only Teacher or Tech can manage classes" };
  }

  const patch: Record<string, unknown> = { location };

  if (canEditClassSchedule(me.role)) {
    const title = String(formData.get("title") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const startsAt = String(formData.get("starts_at") || "");
    const capacity = Number(formData.get("capacity") || CLASS_CAPACITY);

    if (!title || !startsAt) return { error: "Add a title and date" };
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > CLASS_CAPACITY) {
      return { error: `Capacity must be between 1 and ${CLASS_CAPACITY}` };
    }

    const when = new Date(startsAt);
    const dow = when.getDay();
    if (dow !== 1 && dow !== 5) {
      return { error: "Classes can only be scheduled on Monday or Friday" };
    }

    patch.title = title;
    patch.description = description;
    patch.starts_at = when.toISOString();
    patch.capacity = capacity;
  }

  const { error } = await supabase.from("classes").update(patch).eq("id", id);
  if (error) return { error: classDbError(error.message) };
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/classes");
  revalidatePath("/my");
  return { success: "Class updated" };
}

export async function enrollClass(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let classId = String(formData.get("class_id") || "");
  const sessionDate = String(formData.get("session_date") || "");
  if (!classId && sessionDate) {
    classId = (await findOrCreateClassId(sessionDate)) ?? "";
  }
  if (!classId) return { error: "Missing class" };

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me) return { error: "Please log in" };
    if (me.status !== "approved") {
      return { error: "Your application must be approved first" };
    }
    const classRow = buildDemoClasses().find((c) => c.id === classId);
    if (!classRow) return { error: "Class not found" };
    if (!canEnrollNow(classRow.starts_at) && !useLocalDemo()) {
      return {
        error: "Sign-up opens only within 2 weeks before the class",
      };
    }
    const ids = await getDemoEnrollmentIds();
    if (ids.includes(classId)) return { error: "You are already signed up" };
    await saveDemoEnrollmentIds([...ids, classId]);
    revalidatePath("/");
    revalidatePath("/my");
    revalidatePath("/classes");
    return { success: "You are signed up" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };

  const { data: me } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.status !== "approved") {
    return { error: "Your application must be approved first" };
  }

  const { data: classRow } = await supabase
    .from("classes")
    .select("id, capacity, starts_at")
    .eq("id", classId)
    .single();

  if (!classRow) return { error: "Class not found" };

  if (!canEnrollNow(classRow.starts_at)) {
    return {
      error: "Sign-up opens only within 2 weeks before the class",
    };
  }

  const cap = Math.min(classRow.capacity, CLASS_CAPACITY);

  const { count } = await supabase
    .from("enrollments")
    .select("*", { count: "exact", head: true })
    .eq("class_id", classId);

  if ((count ?? 0) >= cap) {
    return { error: CLASS_FULL_MESSAGE };
  }

  const { error } = await supabase.from("enrollments").insert({
    class_id: classId,
    user_id: user.id,
  });

  if (error) {
    if (error.code === "23505") return { error: "You are already signed up" };
    return { error: error.message };
  }

  revalidatePath("/classes");
  revalidatePath("/my");
  revalidatePath("/");
  return { success: "You are signed up" };
}

export async function unenrollClass(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const classId = String(formData.get("class_id") || "");
  if (!classId) return { error: "Missing class" };

  if (useLocalDemo() || (await hasDemoSession())) {
    if (!(await hasDemoSession())) return { error: "Please log in" };
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved") {
      return { error: "Your application must be approved first" };
    }
    const ids = await getDemoEnrollmentIds();
    await saveDemoEnrollmentIds(ids.filter((id) => id !== classId));
    revalidatePath("/");
    revalidatePath("/my");
    revalidatePath("/classes");
    return { success: "Sign-up canceled" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };

  const { data: me } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.status !== "approved") {
    return { error: "Your application must be approved first" };
  }

  const { error } = await supabase
    .from("enrollments")
    .delete()
    .eq("class_id", classId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/classes");
  revalidatePath("/my");
  revalidatePath("/");
  return { success: "Sign-up canceled" };
}

function collectProfileInterests(formData: FormData):
  | { interests: string[] }
  | { error: string } {
  const values = formData
    .getAll("interests")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const { selected, custom } = splitStoredInterests(values);
  const interests = custom ? [...selected, custom] : selected;
  return { interests: interests.slice(0, MAX_INTERESTS) };
}

export async function saveProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const displayName = String(formData.get("display_name") || "").trim();
  const hometown = String(formData.get("hometown") || "").trim();
  const bio = String(formData.get("bio") || "").trim();
  const languages = formData
    .getAll("languages")
    .map((v) => String(v).trim())
    .filter(Boolean)
    .slice(0, 8);
  const parsedInterests = collectProfileInterests(formData);
  if ("error" in parsedInterests) return parsedInterests;
  const interests = parsedInterests.interests;

  if (!displayName) return { error: "Please enter your name" };
  if (bio.length > 600) return { error: "Please keep the intro a little shorter" };

  const now = new Date().toISOString();
  const payload = {
    display_name: displayName,
    hometown,
    languages,
    interests,
    bio,
    onboarding_completed_at: now,
  };

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved") return { error: "Please log in" };
    const members = await getDemoMembers();
    await saveDemoMembers(
      members.map((m) => (m.id === me.id ? { ...m, ...payload } : m)),
    );
    revalidatePath("/", "layout");
    revalidatePath("/profile");
    revalidatePath("/account");
    return { success: "saved" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };

  const { data: me } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.status !== "approved") return { error: "Please log in" };

  const { data, error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Could not save your profile. Please try again." };

  revalidatePath("/", "layout");
  revalidatePath("/profile");
  revalidatePath("/account");
  return { success: "saved" };
}

export async function skipProfile(
  _prev: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const now = new Date().toISOString();

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved") return { error: "Please log in" };
    const members = await getDemoMembers();
    await saveDemoMembers(
      members.map((m) =>
        m.id === me.id ? { ...m, onboarding_completed_at: now } : m,
      ),
    );
    revalidatePath("/", "layout");
    revalidatePath("/profile");
    revalidatePath("/account");
    return { success: "saved" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };

  const { data: me } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.status !== "approved") return { error: "Please log in" };

  const { data, error } = await supabase
    .from("profiles")
    .update({ onboarding_completed_at: now })
    .eq("id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Could not skip right now. Please try again." };

  revalidatePath("/", "layout");
  revalidatePath("/profile");
  revalidatePath("/account");
  return { success: "saved" };
}

export async function changePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const current = String(formData.get("current_password") || "");
  const next = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm_password") || "");

  if (!current || !next || !confirm) {
    return { error: "Please fill in all password fields" };
  }
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }
  if (next !== confirm) return { error: "New passwords do not match" };
  if (current === next) {
    return { error: "Please choose a different new password" };
  }

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me) return { error: "Please log in" };
    const members = await getDemoMembers();
    const match = members.find((m) => m.id === me.id);
    if (!match || match.password !== current) {
      return { error: "Current password is incorrect" };
    }
    await saveDemoMembers(
      members.map((m) => (m.id === me.id ? { ...m, password: next } : m)),
    );
    return { success: "Password updated" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Please log in" };

  const { error: checkError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (checkError) return { error: "Current password is incorrect" };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: error.message };
  return { success: "Password updated" };
}

export async function getPublicProfile(
  userId: string,
): Promise<Pick<
  Profile,
  "id" | "display_name" | "role" | "hometown" | "languages" | "interests" | "bio"
> | null> {
  if (!userId || userId === "system") return null;

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved") return null;
    const members = await getDemoMembers();
    const match = members.find((m) => m.id === userId && m.status === "approved");
    if (!match) return null;
    return {
      id: match.id,
      display_name: match.display_name,
      role: match.role,
      hometown: match.hometown ?? "",
      languages: match.languages ?? [],
      interests: match.interests ?? [],
      bio: match.bio ?? "",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: me } = await supabase
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.status !== "approved") return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, role, status, hometown, languages, interests, bio")
    .eq("id", userId)
    .maybeSingle();

  if (!data || data.status !== "approved") return null;
  return {
    id: data.id,
    display_name: data.display_name,
    role: data.role as Role,
    hometown: data.hometown ?? "",
    languages: data.languages ?? [],
    interests: data.interests ?? [],
    bio: data.bio ?? "",
  };
}

function parseExpiresAt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T23:59:59`).toISOString();
  }
  const when = new Date(trimmed);
  if (Number.isNaN(when.getTime())) return null;
  return when.toISOString();
}

function announcementFields(formData: FormData) {
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const expiresAt = parseExpiresAt(String(formData.get("expires_at") || ""));
  const isImportant = String(formData.get("is_important") || "") === "on";
  const isActive = String(formData.get("is_active") || "") === "on";
  return { title, body, expiresAt, isImportant, isActive };
}

export async function createAnnouncement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { title, body, expiresAt, isImportant } = announcementFields(formData);
  if (!title || !body) return { error: "Add a title and message" };
  if (title.length > 120) return { error: "Title is too long" };
  if (body.length > 2000) return { error: "Message is too long" };

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved" || !canManageAnnouncements(me.role)) {
      return { error: "You cannot post announcements" };
    }
    const rows = await getDemoAnnouncements();
    const row: AnnouncementRow = {
      id: crypto.randomUUID(),
      title,
      body,
      created_by: me.id,
      created_at: new Date().toISOString(),
      updated_at: null,
      expires_at: expiresAt,
      is_important: isImportant,
      is_active: true,
      author_name: me.display_name,
      author_role: me.role,
    };
    await saveDemoAnnouncements([row, ...rows]);
    revalidatePath("/");
    revalidatePath("/announcements");
    return { success: "Announcement posted" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();
  if (!me || me.status !== "approved" || !canManageAnnouncements(me.role)) {
    return { error: "You cannot post announcements" };
  }

  const { error } = await supabase.from("announcements").insert({
    title,
    body,
    created_by: user.id,
    expires_at: expiresAt,
    is_important: isImportant,
    is_active: true,
  });
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/announcements");
  return { success: "Announcement posted" };
}

export async function updateAnnouncement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing announcement" };
  const { title, body, expiresAt, isImportant, isActive } =
    announcementFields(formData);
  if (!title || !body) return { error: "Add a title and message" };

  const payload = {
    title,
    body,
    expires_at: expiresAt,
    is_important: isImportant,
    is_active: isActive,
    updated_at: new Date().toISOString(),
  };

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved" || !canManageAnnouncements(me.role)) {
      return { error: "You cannot edit announcements" };
    }
    const rows = await getDemoAnnouncements();
    await saveDemoAnnouncements(
      rows.map((row) => (row.id === id ? { ...row, ...payload } : row)),
    );
    revalidatePath("/");
    revalidatePath("/announcements");
    return { success: "Announcement updated" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();
  if (!me || me.status !== "approved" || !canManageAnnouncements(me.role)) {
    return { error: "You cannot edit announcements" };
  }

  const { error } = await supabase.from("announcements").update(payload).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/announcements");
  return { success: "Announcement updated" };
}

export async function deleteAnnouncement(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "");
  if (!id) return { error: "Missing announcement" };

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved" || !canManageAnnouncements(me.role)) {
      return { error: "You cannot delete announcements" };
    }
    const rows = await getDemoAnnouncements();
    await saveDemoAnnouncements(rows.filter((row) => row.id !== id));
    revalidatePath("/");
    revalidatePath("/announcements");
    return { success: "Announcement deleted" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();
  if (!me || me.status !== "approved" || !canManageAnnouncements(me.role)) {
    return { error: "You cannot delete announcements" };
  }

  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/announcements");
  return { success: "Announcement deleted" };
}

function revalidateClassTopics(id?: string) {
  revalidatePath("/");
  revalidatePath("/topics");
  revalidatePath("/my");
  if (id) {
    revalidatePath(`/topics/${id}`);
    revalidatePath(`/topics/${id}/edit`);
  }
}

function classTopicFields(formData: FormData) {
  const id = String(formData.get("id") || "").trim();
  const classId = String(formData.get("class_id") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const content = String(formData.get("content") || "").trim();
  const intent = String(formData.get("intent") || "").trim();
  return { id, classId, title, content, intent };
}

async function classStartsAtForTopic(classId: string): Promise<string | null> {
  if (useLocalDemo() || (await hasDemoSession())) {
    const match = (await getDemoClassesWithEnrollments()).find(
      (row) => row.id === classId,
    );
    return match?.starts_at ?? null;
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select("starts_at")
    .eq("id", classId)
    .maybeSingle();
  return data?.starts_at ?? null;
}

export async function saveClassTopic(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { id, classId, title, content: rawContent, intent } = classTopicFields(formData);
  const content = looksLikeTopicHtml(rawContent)
    ? sanitizeTopicHtml(rawContent)
    : rawContent.trim();
  if (!classId) return { error: "Choose a class" };
  if (!title) return { error: "Add a topic title" };
  if (!content || topicContentPlainLength(content) === 0) {
    return { error: "Add the questions or text for this class" };
  }
  if (title.length > CLASS_TOPIC_TITLE_MAX) return { error: "Title is too long" };
  if (topicContentPlainLength(content) > CLASS_TOPIC_CONTENT_MAX) {
    return { error: "Topic text is too long" };
  }

  const classStartsAt = await classStartsAtForTopic(classId);
  if (!classStartsAt || !isPlazaCalendarClass(classStartsAt)) {
    return { error: "Choose a Monday or Friday class from the calendar" };
  }

  const publishNow = intent === "publish";
  const now = new Date().toISOString();

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved" || !canManageClassTopics(me.role)) {
      return { error: "Only Teacher or Tech can edit class topics" };
    }
    const rows = await getDemoClassTopics();
    const existing =
      rows.find((row) => row.id === id) ||
      rows.find((row) => row.class_id === classId);
    const row: ClassTopicRow = existing
      ? {
          ...existing,
          class_id: classId,
          title,
          content,
          is_published:
            intent === "save" ? existing.is_published : publishNow,
          updated_at: now,
        }
      : {
          id: crypto.randomUUID(),
          class_id: classId,
          title,
          content,
          created_by: me.id,
          is_published: publishNow,
          created_at: now,
          updated_at: now,
        };
    const next = existing
      ? rows.map((item) => (item.id === existing.id ? row : item))
      : [row, ...rows];
    await saveDemoClassTopics(next);
    revalidateClassTopics(row.id);
    redirect(`/topics/${row.id}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();
  if (!me || me.status !== "approved" || !canManageClassTopics(me.role)) {
    return { error: "Only Teacher or Tech can edit class topics" };
  }

  const { data: existing } = await supabase
    .from("class_topics")
    .select("id, is_published")
    .eq("class_id", classId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("class_topics")
      .update({
        title,
        content,
        is_published:
          intent === "save" ? existing.is_published : publishNow,
        updated_at: now,
      })
      .eq("id", existing.id);
    if (error) return { error: error.message };
    revalidateClassTopics(existing.id);
    redirect(`/topics/${existing.id}`);
  }

  const { data: created, error } = await supabase
    .from("class_topics")
    .insert({
      class_id: classId,
      title,
      content,
      created_by: user.id,
      is_published: publishNow,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error || !created) return { error: error?.message || "Could not save topic" };
  revalidateClassTopics(created.id);
  redirect(`/topics/${created.id}`);
}

export async function setClassTopicPublished(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "").trim();
  const published = String(formData.get("published") || "") === "true";
  if (!id) return { error: "Missing topic" };
  const now = new Date().toISOString();

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved" || !canManageClassTopics(me.role)) {
      return { error: "Only Teacher or Tech can publish class topics" };
    }
    const rows = await getDemoClassTopics();
    const found = rows.find((row) => row.id === id);
    if (!found) return { error: "Topic not found" };
    await saveDemoClassTopics(
      rows.map((row) =>
        row.id === id
          ? { ...row, is_published: published, updated_at: now }
          : row,
      ),
    );
    revalidateClassTopics(id);
    return { success: published ? "Topic published" : "Topic unpublished" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();
  if (!me || me.status !== "approved" || !canManageClassTopics(me.role)) {
    return { error: "Only Teacher or Tech can publish class topics" };
  }

  const { error } = await supabase
    .from("class_topics")
    .update({ is_published: published, updated_at: now })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateClassTopics(id);
  return { success: published ? "Topic published" : "Topic unpublished" };
}

export async function deleteClassTopic(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") || "").trim();
  if (!id) return { error: "Missing topic" };

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || me.status !== "approved" || !canManageClassTopics(me.role)) {
      return { error: "Only Teacher or Tech can delete class topics" };
    }
    const rows = await getDemoClassTopics();
    await saveDemoClassTopics(rows.filter((row) => row.id !== id));
    revalidateClassTopics();
    redirect("/topics");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please log in" };
  const { data: me } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("id", user.id)
    .single();
  if (!me || me.status !== "approved" || !canManageClassTopics(me.role)) {
    return { error: "Only Teacher or Tech can delete class topics" };
  }

  const { error } = await supabase.from("class_topics").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidateClassTopics();
  redirect("/topics");
}
