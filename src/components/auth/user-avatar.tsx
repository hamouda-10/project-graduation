import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  avatarUrl?: string | null;
  name?: string | null;
  initials?: string | null;
  className?: string;
  fallbackClassName?: string;
}

function computeInitials(name?: string | null, initials?: string | null): string {
  if (initials && initials.trim()) return initials.trim().slice(0, 2).toUpperCase();
  if (!name || !name.trim()) return "MM";
  const parts = name.trim().split(/\s+/);
  return parts
    .map((p) => p[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Renders the user's profile image securely:
 * - For private MeetMind avatar endpoints (`/api/v1/profile/avatars/*`), fetches the binary image
 *   with Bearer authentication + cookies and renders via a managed Object URL so it works reliably
 *   even inside cross-origin preview iframes where third-party cookies may be restricted.
 * - For Google OAuth profile photos (`https://...`), renders directly with `no-referrer`.
 * - Falls back cleanly to user initials if no photo is set or loading fails.
 */
export function UserAvatar({
  avatarUrl,
  name,
  initials,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const isPrivateApiAvatar = Boolean(avatarUrl && avatarUrl.startsWith("/api/v1/profile/avatars/"));

  useEffect(() => {
    setFailed(false);

    if (!avatarUrl) {
      setResolvedSrc(null);
      return;
    }

    if (!isPrivateApiAvatar) {
      setResolvedSrc(avatarUrl);
      return;
    }

    let revoked = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    api
      .fetchAuthenticatedImageBlob(avatarUrl, controller.signal)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setResolvedSrc(objectUrl);
      })
      .catch(() => {
        if (!revoked) {
          setResolvedSrc(null);
          setFailed(true);
        }
      });

    return () => {
      revoked = true;
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [avatarUrl, isPrivateApiAvatar]);

  const label = computeInitials(name, initials);

  if (resolvedSrc && !failed) {
    return (
      <img
        src={resolvedSrc}
        alt={name || "User profile photo"}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn("object-cover", className)}
      />
    );
  }

  return (
    <span
      aria-label={name || "User avatar"}
      className={cn(
        "flex items-center justify-center bg-gradient-to-br from-amber-400/25 to-amber-600/25 border border-amber-500/40 font-bold text-amber-300 select-none",
        className,
        fallbackClassName,
      )}
    >
      {label}
    </span>
  );
}
