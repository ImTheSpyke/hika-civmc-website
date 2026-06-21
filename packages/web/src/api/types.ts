export interface Me {
  id: number;
  discordUsername: string;
  discordDisplayName: string;
  mcUsername: string | null;
  mcVerified: boolean;
  status: "pending" | "approved" | "rejected";
  isAdmin: boolean;
  publicFactionTag: string | null;
}

export interface UserResult {
  userId: number;
  discordUsername: string;
  discordDisplayName: string;
  mcUsername: string | null;
  mcVerified: boolean;
  publicFactionTag: string | null;
  avatarUrl: string | null;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface PlayerNote {
  mcUsername: string;
  body: string;
  updatedAt: string;
  resolvedUser: {
    id: number;
    discordDisplayName: string;
    mcVerified: boolean;
    publicFactionTag: string | null;
    avatarUrl: string;
  } | null;
}

export interface Newspaper {
  id: number;
  name: string;
  description: string;
  status?: "pending" | "approved" | "rejected";
  created_at: string;
}

export interface Article {
  id: number;
  title: string;
  body: string;
  published_at: string;
}

export interface Event {
  id: number;
  name: string;
  description: string;
  starts_at: string;
  duration_minutes: number;
  x: number | null;
  y: number | null;
  z: number | null;
  isSystem: boolean;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}
