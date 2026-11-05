"use client";

import { useRouter } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { meQuery } from "@/entities/user/session";
import { api, okOrThrow } from "@/shared/api/client";

export const SignOutButton = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const signOut = useMutation({
    mutationFn: async () => okOrThrow(await api.POST("/api/auth/sign-out")),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(meQuery.queryKey, null);
      router.replace("/entrar");
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="destructive"
        className="min-h-11 w-full sm:w-auto"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        <LogOut />
        Sair
      </Button>
      {signOut.isError && (
        <p role="alert" className="text-destructive text-sm">
          Não foi possível sair. Tente de novo.
        </p>
      )}
    </div>
  );
};
