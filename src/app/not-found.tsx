import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-sm font-semibold text-accent-700">404</p>
      <h1 className="text-2xl font-semibold text-slate-900">Not found</h1>
      <p className="max-w-md text-sm text-slate-600">This record does not exist, has been archived, or you do not have access to it.</p>
      <Link href="/dashboard" className="mt-2 text-sm font-medium text-brand-600 hover:underline">
        Back to Command Center
      </Link>
    </main>
  );
}
