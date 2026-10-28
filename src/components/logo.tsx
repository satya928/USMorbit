import { Orbit } from "lucide-react";

export function Logo({ light }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-lg bg-accent-500 text-navy-900" aria-hidden>
        <Orbit className="size-5" strokeWidth={2.25} />
      </span>
      <span className={light ? "text-white" : "text-slate-900"}>
        <span className="block text-lg font-semibold leading-none">USM Orbit</span>
        <span className={light ? "text-xs text-navy-200" : "text-xs text-slate-500"}>Service & Maintenance Operations</span>
      </span>
    </div>
  );
}
