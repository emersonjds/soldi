"use client";

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
        <Button variant="link" className="min-h-11 px-0 text-muted-foreground text-sm" disabled={signOut.isPending}>
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
