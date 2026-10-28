"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center" role="alert">
      <AlertTriangle className="size-8 text-amber-500" aria-hidden />
      <h1 className="text-lg font-semibold text-slate-900">Something went wrong</h1>
      <p className="max-w-md text-sm text-slate-600">We could not load this page. Your data has not been changed. Try again, and contact your administrator if the problem continues.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
