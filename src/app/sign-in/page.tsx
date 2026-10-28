import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { getContext } from "@/lib/auth/session";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/db/seed-accounts";
import { SignInForm } from "./sign-in-form";
import { Logo } from "@/components/logo";
import { Notice } from "@/components/ui";
import { GOOGLE_ERROR_MESSAGES, googleConfig } from "@/lib/auth/google";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if (await getContext()) redirect("/dashboard");
  const { next, error } = await searchParams;
  const googleEnabled = !!googleConfig();
  const errorMessage = error ? GOOGLE_ERROR_MESSAGES[error] : undefined;
  const demo = process.env.DEMO_MODE === "true";
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-navy-900 p-10 text-white lg:flex">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-accent-500/10" aria-hidden />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-brand-500/10" aria-hidden />
        <Logo light />
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">One Platform. Every Service & Maintenance Operation.</h1>
          <p className="mt-3 text-navy-200">Requests, work orders, inspections, compliance and client sign-off — connected across every site.</p>
          <ul className="mt-8 space-y-4 text-sm text-navy-100">
            {[
              [Workflow, "Request → assignment → inspection → client approval, with a full audit trail"],
              [ShieldCheck, "Contractor and workforce compliance tracking with expiry alerts"],
              [Building2, "Sites, assets and service history in one place"],
              [Sparkles, "AI Copilot grounded in your own operational records"],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof Workflow;
              return (
                <li key={i} className="flex gap-3">
                  <I className="mt-0.5 size-5 shrink-0 text-accent-500" aria-hidden />
                  <span>{text as string}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-xs text-navy-200">Beta · For invited pilot customers</p>
      </section>
      <section className="flex flex-col justify-center px-4 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-600">Use your USM Orbit workspace account.</p>
          {errorMessage && (
            <div className="mt-4">
              <Notice tone="error">{errorMessage}</Notice>
            </div>
          )}
          {googleEnabled && (
            <>
              <a
                href={`/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}`}
                className="mt-6 flex w-full items-center justify-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-xs hover:bg-slate-50"
              >
                <GoogleMark />
                Continue with Google
              </a>
              <div className="mt-6 flex items-center gap-3 text-xs text-slate-400" aria-hidden>
                <span className="h-px flex-1 bg-slate-200" /> or sign in with email <span className="h-px flex-1 bg-slate-200" />
              </div>
            </>
          )}
          <SignInForm next={next} />
          {demo && (
            <div className="mt-8 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts (fictional data)</p>
              <p className="mt-1 text-xs text-slate-600">
                Password for all: <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">{DEMO_PASSWORD}</code>
              </p>
              <ul className="mt-2 divide-y divide-slate-100 text-xs">
                {DEMO_ACCOUNTS.map((a) => (
                  <li key={a.email} className="flex justify-between gap-2 py-1.5">
                    <span className="text-slate-600">{a.label}</span>
                    <code className="font-mono text-slate-900">{a.email}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
