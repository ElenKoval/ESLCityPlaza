export type Role = "student" | "volunteer" | "teacher" | "tech";
export type ProfileStatus = "pending" | "approved" | "rejected";
export type RequestedRole = "student" | "volunteer";

export type Profile = {
  id: string;
  display_name: string;
  role: Role;
  status: ProfileStatus;
  requested_role: RequestedRole | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  /** Present in local demo mode only */
  email?: string;
};

export type ClassRow = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  capacity: number;
  created_by: string | null;
  created_at: string;
  enrollment_count?: number;
  enrolled?: boolean;
};

export type MessageRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  profiles?: Pick<Profile, "display_name" | "role"> | null;
};
