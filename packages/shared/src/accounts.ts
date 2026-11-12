import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{4,32}$/);
export const passwordSchema = z.string().min(8).max(128);
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const hairStyles = ['Cropped', 'Swept', 'Long'] as const;
export const hairColors = ['Chestnut', 'Black', 'Auburn', 'Gold', 'Silver'] as const;
export const tunicColors = ['Pine', 'Indigo', 'Crimson', 'Ochre', 'Plum'] as const;

export const characterSchema = z.strictObject({
  displayName: z
    .string()
    .trim()
    .min(2)
    .max(24)
    .regex(/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'-]*$/u),
  hairStyle: z
    .int()
    .min(0)
    .max(hairStyles.length - 1),
  hairColor: z
    .int()
    .min(0)
    .max(hairColors.length - 1),
  tunicColor: z
    .int()
    .min(0)
    .max(tunicColors.length - 1),
});

export type CharacterAppearance = z.infer<typeof characterSchema>;
export type MemberRole = 'admin' | 'member';

export interface GuildProfile {
  memberId: string;
  role: MemberRole;
  character: (CharacterAppearance & { id: string; gold: number; xp: number; level: number }) | null;
}

export interface GuildInvitation {
  id: string;
  status: 'issued' | 'pending' | 'consumed' | 'revoked' | 'expired';
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
}

export interface GuildMember {
  id: string;
  username: string;
  displayName: string | null;
  role: MemberRole;
  status: 'active' | 'suspended';
}
