import { requireContext } from "@/lib/auth/session";
import { Card } from "@/components/ui";
import { ChangePasswordForm } from "./form";

export const metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  const ctx = await requireContext();
  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <Card title="Change your password">
        <p className="mb-4 text-sm text-slate-600">Signed in as {ctx.userEmail}. Choose a new password of at least 10 characters with letters and numbers. Other sessions will be signed out.</p>
        <ChangePasswordForm />
      </Card>
    </main>
  );
}
