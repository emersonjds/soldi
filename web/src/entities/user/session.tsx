"use client";

import { type ReactNode, useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { queryOptions, useQuery } from "@tanstack/react-query";

import { api, type Schemas } from "@/shared/api/client";
import { PageError, PageLoading } from "@/shared/ui/page-state";

export type User = Schemas["User"];

/** The signed-in user, or `null` for a visitor without a session. */
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    const { data, response } = await api.GET("/api/auth/me");
    if (response.status === 401) return null;
    if (!data) throw new Error(`GET /api/auth/me answered ${response.status}`);
    return data;
  },
  staleTime: Number.POSITIVE_INFINITY,
});

export const useMe = () => useQuery(meQuery);

/** Where a user at `pathname` must go instead, or `undefined` to stay. */
export const redirectFor = (user: User | null, pathname: string) => {
  if (!user) return "/entrar";
  if (!user.onboarded) return pathname === "/onboarding" ? undefined : "/onboarding";
  return pathname === "/" || pathname === "/onboarding" ? "/mes" : undefined;
};

export const SessionGate = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();
  const target = me.isSuccess ? redirectFor(me.data, pathname) : undefined;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (me.isError) return <PageError message="Não foi possível abrir sua conta." onRetry={() => me.refetch()} />;
  if (!me.isSuccess || target) return <PageLoading />;
  return children;
};
