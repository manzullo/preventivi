"use client";

// Bottone di invio che si spegne e lo dice, mentre il modulo è in viaggio.
// Senza, un salvataggio lento è indistinguibile da un bottone rotto: il
// 22/09/2026 la stessa scheda è stata salvata sei volte di fila per questo.
import { useFormStatus } from "react-dom";
import { Button } from "@/design/ui";

type Props = React.ComponentProps<typeof Button> & { pendingLabel?: string };

export function SubmitButton({ children, pendingLabel = "Salvataggio…", ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...rest}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
