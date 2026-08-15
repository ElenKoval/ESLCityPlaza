"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { canEnrollNow, CLASS_CAPACITY } from "@/lib/enrollment";
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
import { emailForUserId, authEmailExists, createAdminClient } from "@/lib/auth-admin";
import { sendApprovedWelcomeEmail } from "@/lib/mail";
import { MAX_INTERESTS, INTEREST_CHIPS, needsProfileSetup } from "@/lib/profile";
import {
  assignableRoles,
  canDeleteMember,
  canManageAnnouncements,
  canManageClasses,
  canReviewApplications,
} from "@/lib/roles";
import type { AnnouncementRow, RequestedRole, Role } from "@/lib/types";
import {
  getDemoAnnouncements,
  saveDemoAnnouncements,
} from "@/lib/demo-announcements";
import {
  EXISTING_ACCOUNT_MESSAGE,
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
    });
    await saveDemoMembers([...members, member]);
    await setDemoSession(member.id);
    redirect("/pending");
  }

  const exists = await authEmailExists(email);
  if (exists) return { error: EXISTING_ACCOUNT_MESSAGE };

  const supabase = await createClient();
  const headersList = await headers();
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ||
    headersList.get("origin") ||
    "http://localhost:3000";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/pending`,
      data: {
        display_name: displayName,
        requested_role: requestedRole,
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

  if (!data.session) {
    redirect(`/register/check-email?email=${encodeURIComponent(email)}`);
  }

  redirect("/pending");
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
    if (target?.role === "tech") {
      return { error: "Cannot change a Tech account" };
    }
    if (
      me.role === "teacher" &&
      target?.role === "teacher" &&
      target.status === "approved"
    ) {
      return { error: "Teachers cannot change other teachers" };
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
  if (target.role === "tech") {
    return { error: "Cannot change a Tech account" };
  }
  if (
    me.role === "teacher" &&
    target.role === "teacher" &&
    target.status === "approved"
  ) {
    return { error: "Teachers cannot change other teachers" };
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

  const { error } = await supabase.from("profiles").update(payload).eq("id", userId);
  if (error) return { error: error.message };

  if (decision === "approve") {
    const email = await emailForUserId(userId);
    const { data: person } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    if (email) {
      const mail = await sendApprovedWelcomeEmail(
        email,
        person?.display_name || "there",
      );
      revalidatePath("/tech");
      if (!mail.sent) {
        return {
          success:
            "Approved. Welcome email was not sent — add RESEND_API_KEY on Render.",
        };
      }
      return { success: "Approved. We emailed them a welcome note." };
    }
    revalidatePath("/tech");
    return {
      success: "Approved. Could not look up their email (needs service role key).",
    };
  }

  revalidatePath("/tech");
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
    starts_at: new Date(startsAt).toISOString(),
    capacity,
    created_by: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin");
  revalidatePath("/classes");
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
  revalidatePath("/admin");
  revalidatePath("/classes");
  revalidatePath("/my");
  return { success: "Class deleted" };
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
    return { error: "This class is full (15 max)" };
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
