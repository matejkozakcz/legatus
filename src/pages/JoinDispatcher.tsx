import { useParams } from "react-router-dom";
import Join from "./Join";
import JoinWorkspace from "./JoinWorkspace";

/**
 * Single /join/:token entrypoint.
 * - 6-char alphanumeric uppercase code  → workspace invite (org_units.invite_token)
 * - anything else (typically 64-char hex) → personal invite (invites.token)
 */
export default function JoinDispatcher() {
  const { token } = useParams<{ token: string }>();
  const normalized = (token ?? "").trim().toUpperCase();
  const isWorkspaceCode = /^[A-Z0-9]{6}$/.test(normalized);

  if (isWorkspaceCode) return <JoinWorkspace />;
  return <Join />;
}
