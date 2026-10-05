import { Button } from "@/design/ui";
import { Marchio } from "@/components/SiteHeader";
import { login } from "@/app/admin/actions";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const failed = sp.errore === "1";
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <Marchio className="mb-8" testo="text-2xl" icona="size-9" />
      <form action={login} className="rounded-card border border-line bg-canvas p-6 shadow-card">
        {/* Dove tornare dopo: lo porta con sé chi è stato mandato qui da una
            richiesta di collegamento. */}
        <input type="hidden" name="torna" value={typeof sp.torna === "string" ? sp.torna : ""} />
        <label className="mb-4 block">
          <span className="t-meta mb-1.5 block text-ink">Email</span>
          <input type="email" name="email" autoComplete="username" autoFocus className="w-full rounded-slot border-[1.5px] border-line px-4 py-3 text-[15px] outline-none focus:border-action" />
        </label>
        <label className="block">
          <span className="t-meta mb-1.5 block text-ink">Password</span>
          <input type="password" name="password" autoComplete="current-password" className="w-full rounded-slot border-[1.5px] border-line px-4 py-3 text-[15px] outline-none focus:border-action" />
        </label>
        {failed && <p className="mt-3 text-sm font-semibold text-brand">Credenziali errate.</p>}
        <Button type="submit" arrow className="mt-5 w-full">
          Entra
        </Button>
      </form>
    </div>
  );
}
