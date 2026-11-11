"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLeave } from "@/entities/user/session";
import { api, okOrThrow } from "@/shared/api/client";

export const SignOutButton = () => {
  const signOut = useLeave(async () => okOrThrow(await api.POST("/api/auth/sign-out")));

  return (
    <div className="flex flex-col">
      <Button
        variant="ghost"
        className="min-h-16 w-full justify-start gap-3 rounded-none px-4 font-medium text-base text-destructive hover:bg-muted hover:text-destructive"
        disabled={signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-expense/10">
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
