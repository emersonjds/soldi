"use client";

import { type ReactNode, useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, okOrThrow, type Schemas } from "@/shared/api/client";
import { clearAllHistories } from "@/shared/lib/simulation-history";
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
  if (pathname === "/tour") return undefined;
  if (!user.tour_seen) return "/tour";
  return pathname === "/" || pathname === "/onboarding" ? "/mes" : undefined;
};

/** `POST /api/me/tour-seen`; the cached user reads `tour_seen` once it answers. */
export const useTourSeen = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => okOrThrow(await api.POST("/api/me/tour-seen")),
    onSuccess: () => queryClient.setQueryData(meQuery.queryKey, (user) => (user ? { ...user, tour_seen: true } : user)),
  });
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

/** Runs `leave`, then forgets every cached answer and goes to sign-in. */
export const useLeave = (leave: () => Promise<void>) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leave,
    onSettled: clearAllHistories,
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(meQuery.queryKey, null);
      router.replace("/entrar");
    },
  });
};
