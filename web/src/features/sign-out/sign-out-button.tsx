"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLeave } from "@/entities/user/session";
import { api, okOrThrow } from "@/shared/api/client";

export const SignOutButton = () => {
  const signOut = useLeave(async () => okOrThrow(await api.POST("/api/auth/sign-out")));

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        className="h-12 gap-2 px-5 font-semibold text-base"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        <LogOut aria-hidden className="size-5" />
        Sair da conta (Logout)
      </Button>
      {signOut.isError && (
        <p role="alert" className="text-destructive text-sm">
          Não foi possível sair. Tente de novo.
        </p>
      )}
    </div>
  );
};
