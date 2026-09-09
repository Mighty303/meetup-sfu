import { auth } from "@/auth";
import { canEditMember, findGroup } from "./groups";

export type MemberAccess =
  | { id: number; groupId: number; term: string }
  | { error: string; status: 403 | 404 };

/**
 * Resolves a member inside a group and checks the caller may edit it. Owned
 * rows require their owner; rows without an owner predate sign-in and stay open
 * to anyone with the invite code. Shared by every route that writes to a member.
 */
export async function authorizeMember(
  code: string,
  memberId: string
): Promise<MemberAccess> {
  const group = await findGroup(code.toUpperCase());
  if (!group) return { error: "group not found", status: 404 };

  const id = Number(memberId);
  if (!Number.isInteger(id)) {
    return { error: "member not in this group", status: 404 };
  }

  const session = await auth();
  const allowed = await canEditMember(id, group.id, session?.appUserId ?? null);
  if (!allowed) return { error: "that's not your schedule to edit", status: 403 };

  return { id, groupId: group.id, term: group.term };
}
