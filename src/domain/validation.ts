import { z } from "zod";
import { invalid } from "@/lib/errors";

const blankToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);

export const zOptUuid = z.preprocess(blankToUndef, z.uuid().optional());
export const zOptText = (max = 300) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(max).optional());
export const zOptEmail = z.preprocess(blankToUndef, z.email("Enter a valid email").max(200).optional());
export const zOptDate = z.preprocess(
  blankToUndef,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional(),
);
export const zList = z.preprocess(
  (v) =>
    Array.isArray(v)
      ? v
      : typeof v === "string"
        ? v
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
  z.array(z.string().max(100)).max(50),
);
export const zTimezone = z
  .string()
  .trim()
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone");

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of r.error.issues) fieldErrors[issue.path.join(".") || "_"] ??= issue.message;
    throw invalid("Please correct the highlighted fields.", fieldErrors);
  }
  return r.data;
}

export const isUuid = (v: string) => z.uuid().safeParse(v).success;
