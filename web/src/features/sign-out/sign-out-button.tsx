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
    <div className="flex flex-col">
      <Button
        variant="ghost"
        className="min-h-16 w-full justify-start gap-3 rounded-none px-4 font-medium text-base text-destructive hover:bg-muted hover:text-destructive"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-expense-soft">
          <LogOut className="size-5" />
        </span>
        Sair
      </Button>
      {signOut.isError && (
        <p role="alert" className="px-4 pb-3 text-destructive text-sm">
          Não foi possível sair. Tente de novo.
        </p>
      )}
    </div>
  );
};
