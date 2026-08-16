"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canEnrollNow, CLASS_CAPACITY, CLASS_FULL_MESSAGE } from "@/lib/enrollment";
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
  getDemoEnrollmentIds,
  saveDemoEnrollmentIds,
} from "@/lib/demo-classes";
import { findOrCreateClassId } from "@/lib/ensure-classes";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { EmailOtpType } from "@supabase/supabase-js";
import { emailForUserId, authEmailExists, createAdminClient } from "@/lib/auth-admin";
import { sendApprovedWelcomeEmail, sendNewApplicationNotice } from "@/lib/mail";
import { MAX_INTERESTS, INTEREST_CHIPS, needsProfileSetup } from "@/lib/profile";
import {
  assignableRoles,
  canDeleteMember,
  canEditClassSchedule,
  canManageAnnouncements,
  canManageClasses,
  canReviewApplications,
} from "@/lib/roles";
import { DEFAULT_CLASS_LOCATION } from "@/lib/class-schedule";
import { authConfirmUrl } from "@/lib/site-url";
import type { AnnouncementRow, Profile, RequestedRole, Role } from "@/lib/types";
import {
  getDemoAnnouncements,
  saveDemoAnnouncements,
} from "@/lib/demo-announcements";
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
    if (match.status !== "approved") {
      redirect("/pending");
    }
    if (needsProfileSetup(match)) {
      redirect("/profile");
    }
    redirect(next.startsWith("/") ? next : "/");
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();

  if (profile?.status === "pending" || profile?.status === "rejected") {
    redirect("/pending");
  }
  if (profile && needsProfileSetup(profile)) {
    redirect("/profile");
  }

  redirect(next.startsWith("/") ? next : "/");
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
  const requestedRole = String(
    formData.get("requested_role") || "student",
  ) as RequestedRole;

  if (!email || !password || !displayName) {
    return { error: "Please fill in all fields" };
  }
  const emailError = registrationEmailError(email);
  if (emailError) return { error: emailError };
  if (requestedRole !== "student" && requestedRole !== "teacher") {
    return { error: "Choose Student or Teacher" };
  }
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
      requestedRole,
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
        requested_role: requestedRole,
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
    requestedRole,
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
    const { data: profile } = await db
      .from("profiles")
      .select("display_name, status, requested_role, hometown, heard_from")
      .eq("id", userId)
      .maybeSingle();
    if (!profile || profile.status !== "pending") {
      console.error("[confirm] application notice skipped: not pending", userId);
      return { sent: false as const };
    }

    const mail = await sendNewApplicationNotice({
      name: profile.display_name,
      email,
      requestedRole: profile.requested_role || "student",
      hometown: profile.hometown,
      heardFrom: profile.heard_from,
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
        if (data.user) {
          confirmedUser = { id: data.user.id, email: data.user.email };
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
    if (data.user) {
      confirmedUser = { id: data.user.id, email: data.user.email };
    }
  }

  if (!confirmedUser) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) confirmedUser = { id: user.id, email: user.email };
  }

  after(async () => {
    await notifyConfirmedApplication(confirmedUser ?? undefined);
  });
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
  return { success: "Test email sent. Check inbox (and spam) for ESL on the Plaza." };
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
  const role = String(formData.get("role") || "student") as Role;

  if (!displayName) return { error: "Please enter a name" };
  if (displayName.length > 60) return { error: "Please use a shorter name" };
  const emailError = registrationEmailError(email);
  if (emailError) return { error: emailError };
  if (role !== "student" && role !== "teacher") {
    return { error: "Choose Student or Teacher" };
  }

  const tempPassword = generateTempPassword();
  const now = new Date().toISOString();

  if (useLocalDemo() || (await hasDemoSession())) {
    const me = await getDemoSessionProfile();
    if (!me || !canReviewApplications(me.role) || me.status !== "approved") {
      return { error: "Only Teacher or Tech can add members" };
    }
    const members = await getDemoMembers();
    if (members.some((m) => m.email?.toLowerCase() === email)) {
      return { error: EXISTING_ACCOUNT_MESSAGE };
    }
    const member = createPendingMember({
      displayName,
      email,
      password: tempPassword,
      requestedRole: role,
    });
    member.status = "approved";
    member.role = role;
    member.reviewed_at = now;
    member.reviewed_by = me.id;
    await saveDemoMembers([member, ...members]);
    revalidatePath("/tech");
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
    return { error: "Only Teacher or Tech can add members" };
  }

  const exists = await authEmailExists(email);
  if (exists) return { error: EXISTING_ACCOUNT_MESSAGE };

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Adding members needs SUPABASE_SERVICE_ROLE_KEY on Render" };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      display_name: displayName,
      requested_role: role,
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

  const payload = {
    display_name: displayName,
    role,
    status: "approved" as const,
    reviewed_at: now,
    reviewed_by: user.id,
  };

  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", newId)
    .maybeSingle();

  const { error: profileError } = profile
    ? await admin.from("profiles").update(payload).eq("id", newId)
    : await admin.from("profiles").insert({
        id: newId,
        requested_role: role,
        ...payload,
      });

  if (profileError) return { error: profileError.message };

  revalidatePath("/tech");
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
  const role = String(formData.get("role") || "student") as Role;

  if (!userId || !["approve", "reject"].includes(decision)) {
    return { error: "Invalid application" };
  }

  const allowed = assignableRoles();
  if (decision === "approve" && !allowed.includes(role)) {
    return { error: "That role cannot be assigned here" };
  }
  if (role === "tech") {
    return { error: "Tech cannot be assigned here" };
  }

  if (useLocalDemo()) {
    const me = await getDemoSessionProfile();
    if (!me || !canReviewApplications(me.role) || me.status !== "approved") {
      return { error: "Only Teacher or Tech can review applications" };
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
        role: decision === "approve" ? role : m.role,
        reviewed_at: new Date().toISOString(),
        reviewed_by: me.id,
      };
    });
    await saveDemoMembers(next);
    revalidatePath("/tech");
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
    return { error: "Only Teacher or Tech can review applications" };
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
          role,
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
    revalidatePath("/tech");
    revalidatePath("/pending");
    if (email) {
      const mail = await sendApprovedWelcomeEmail(
        email,
        person?.display_name || "there",
      );
      if (!mail.sent) {
        console.error("[approve] approval email not sent", mail.error);
        return {
          success: "User approved, but approval email could not be sent.",
        };
      }
      return { success: "Approved. We emailed them a welcome note." };
    }
    return {
      success: "User approved, but approval email could not be sent.",
    };
  }

  revalidatePath("/tech");
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
    revalidatePath("/tech");
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
    revalidatePath("/tech");
    return {
      success: "Account blocked (add SUPABASE_SERVICE_ROLE_KEY to fully delete)",
    };
  }

  const admin = createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  revalidatePath("/tech");
  return { success: "Account deleted" };
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

const ALLOWED_INTERESTS = new Set<string>(INTEREST_CHIPS);

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
  const interests = formData
    .getAll("interests")
    .map((v) => String(v))
    .filter((v) => ALLOWED_INTERESTS.has(v))
    .slice(0, MAX_INTERESTS);

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
      return { error: "Only Teacher or Tech can post announcements" };
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
    return { error: "Only Teacher or Tech can post announcements" };
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
      return { error: "Only Teacher or Tech can edit announcements" };
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
    return { error: "Only Teacher or Tech can edit announcements" };
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
      return { error: "Only Teacher or Tech can delete announcements" };
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
    return { error: "Only Teacher or Tech can delete announcements" };
  }

  const { error } = await supabase.from("announcements").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/");
  revalidatePath("/announcements");
  return { success: "Announcement deleted" };
}
