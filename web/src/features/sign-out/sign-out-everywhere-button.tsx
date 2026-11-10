"use client";

import { MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useLeave } from "@/entities/user/session";
import { api, okOrThrow } from "@/shared/api/client";

/** Ends every session of the user, this one included, after a confirmation. */
export const SignOutEverywhereButton = () => {
  const signOut = useLeave(async () => okOrThrow(await api.POST("/api/auth/sign-out-everywhere")));

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          className="min-h-16 w-full justify-start gap-3 rounded-none px-4 font-medium text-base text-destructive hover:bg-muted hover:text-destructive"
          disabled={signOut.isPending}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-expense/10">
            <MonitorSmartphone className="size-5" />
          </span>
          Sair de todos os aparelhos
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sair de todos os aparelhos?</AlertDialogTitle>
          <AlertDialogDescription>Você vai precisar entrar de novo em cada um.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="h-11"
            onClick={() =>
              signOut.mutate(undefined, { onError: () => toast.error("Não foi possível sair. Tente de novo.") })
            }
          >
            Sair de todos
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
