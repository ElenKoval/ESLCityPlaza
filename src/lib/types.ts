export type Role = "student" | "teacher" | "admin" | "tech";
export type ProfileStatus = "pending" | "approved" | "rejected" | "suspended";
export type RequestedRole = "student" | "teacher";
export type ModerationAction = "mute" | "unmute" | "suspend" | "unsuspend";

export type Profile = {
  id: string;
  display_name: string;
  role: Role;
  status: ProfileStatus;
  requested_role: RequestedRole | null;
  hometown?: string;
  heard_from?: string;
  languages?: string[];
  interests?: string[];
  bio?: string;
  muted?: boolean;
  onboarding_completed_at?: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  /** Filled for Approvals / member admin, and in local demo mode */
  email?: string;
};

export type ClassRow = {
  id: string;
  title: string;
  description: string;
  location?: string;
  starts_at: string;
  capacity: number;
  created_by: string | null;
  created_at: string;
  enrollment_count?: number;
  enrolled?: boolean;
};

export type ClassRosterEntry = {
  userId: string;
  displayName: string;
  role: Role;
};

export type ClassRoster = {
  classId: string;
  title: string;
  startsAt: string;
  location?: string;
  capacity?: number;
  people: ClassRosterEntry[];
};

export type ClassTopicRow = {
  id: string;
  class_id: string;
  title: string;
  content: string;
  created_by: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  class_title?: string;
  class_starts_at?: string;
  class_location?: string;
};

export type ClassTopicSummary = {
  id: string;
  class_id: string;
  title: string;
};

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  created_by: string;
  created_at: string;
  updated_at: string | null;
  expires_at: string | null;
  is_important: boolean;
  is_active: boolean;
  author_name?: string;
  author_role?: Role;
};

export type MessageRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  is_announcement?: boolean;
  image_path?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  file_path?: string | null;
  file_name?: string | null;
  profiles?: Pick<Profile, "display_name" | "role"> | null;
};

export type DirectConversationRow = {
  id: string;
  user_low: string;
  user_high: string;
  created_by: string;
  created_at: string;
  last_message_at: string | null;
  last_sender_id?: string | null;
  last_preview: string;
};

export type DirectMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  image_path?: string | null;
  image_width?: number | null;
  image_height?: number | null;
};

export type DirectConversationListItem = {
  id: string;
  otherId: string;
  otherName: string;
  otherRole: Role;
  lastPreview: string;
  lastMessageAt: string | null;
  unread: boolean;
  blockedByMe: boolean;
  blockedEitherWay: boolean;
};

export type DirectThreadMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  image_path?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  imageUrl?: string | null;
};
