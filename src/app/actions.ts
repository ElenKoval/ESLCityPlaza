"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { canEnrollNow, CLASS_CAPACITY } from "@/lib/enrollment";
import {
  createPendingMember,
  DEMO_TECH_ID,
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
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { RequestedRole, Role } from "@/lib/types";

export type ActionState = { error?: string; success?: string } | null;

export async function signIn(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/");

  if (!email || !password) {
    return { error: "Enter email and password" };
  }

  if (useLocalDemo()) {
    const members = await getDemoMembers();
    const match = members.find(
      (m) =>
        m.email?.toLowerCase() === email && m.password === password,
    );
    if (!match) {
      return { error: "Invalid email or password" };
    }
    await setDemoSession(match.id);
    if (match.status !== "approved") {
      redirect("/pending");
    }
    redirect(next.startsWith("/") ? next : "/");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect(next.startsWith("/") ? next : "/");
}

export async function signUp(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const displayName = String(formData.get("display_name") || "").trim();
  const requestedRole = String(
    formData.get("requested_role") || "student",
  ) as RequestedRole;

  if (!email || !password || !displayName) {
    return { error: "Please fill in all fields" };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }
  if (requestedRole !== "student" && requestedRole !== "volunteer") {
    return { error: "Choose Student or Volunteer" };
  }

  if (useLocalDemo()) {
    const members = await getDemoMembers();
    if (members.some((m) => m.email?.toLowerCase() === email)) {
      return { error: "An account with this email already exists" };
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

  if (error) return { error: error.message };

  // Confirm-email enabled → no session until they click the link
  if (!data.session) {
    return {
      success:
        "Application received. Confirm your email (if required), then log in.",
    };
  }

  redirect("/pending");
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

  const allowed: Role[] = ["student", "volunteer", "teacher"];
  if (decision === "approve" && !allowed.includes(role)) {
    return { error: "That role cannot be assigned here" };
  }

  if (useLocalDemo()) {
    const me = await getDemoSessionProfile();
    if (!me || me.role !== "tech" || me.status !== "approved") {
      return { error: "Only Tech can review applications" };
    }
    const members = await getDemoMembers();
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
        decision === "approve" ? "Application approved" : "Application rejected",
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

  if (!me || me.role !== "tech" || me.status !== "approved") {
    return { error: "Only Tech can review applications" };
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

  revalidatePath("/tech");
  return {
    success: decision === "approve" ? "Application approved" : "Application rejected",
  };
}

export async function deleteMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = String(formData.get("user_id") || "");
  if (!userId) return { error: "Missing user" };

  if (useLocalDemo()) {
    const me = await getDemoSessionProfile();
    if (!me || me.role !== "tech" || me.status !== "approved") {
      return { error: "Only Tech can delete accounts" };
    }
    if (userId === DEMO_TECH_ID || userId === me.id) {
      return { error: "You cannot delete your own Tech account" };
    }
    const members = await getDemoMembers();
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

  if (!me || me.role !== "tech" || me.status !== "approved") {
    return { error: "Only Tech can delete accounts" };
  }
  if (userId === user.id) {
    return { error: "You cannot delete your own account" };
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
  const classId = String(formData.get("class_id") || "");
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
