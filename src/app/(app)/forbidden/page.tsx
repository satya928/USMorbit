import { ShieldAlert } from "lucide-react";
import { LinkButton } from "@/components/ui";

export const metadata = { title: "Access denied" };

export default function Forbidden() {
  return (
    <div className="flex flex-col items-center gap-3 py-20 text-center">
      <ShieldAlert className="size-8 text-amber-500" aria-hidden />
      <h1 className="text-lg font-semibold text-slate-900">You don&apos;t have access to this page</h1>
      <p className="max-w-md text-sm text-slate-600">Your role does not include this area. Ask a workspace administrator if you need access.</p>
      <LinkButton href="/dashboard" variant="secondary">
        Back to Command Center
      </LinkButton>
    </div>
  );
}
