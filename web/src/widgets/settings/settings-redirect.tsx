"use client";

import { useEffect } from "react";

import { useRouter, useSearchParams } from "next/navigation";

/** Sends an old Ajustes subpage to its section; the static export has no server redirects. */
export const SettingsRedirect = ({ anchor }: { anchor: string }) => {
  const router = useRouter();
  const search = useSearchParams().toString();

  useEffect(() => {
    router.replace(`/ajustes${search && `?${search}`}#${anchor}`);
  }, [router, search, anchor]);

  return null;
};
