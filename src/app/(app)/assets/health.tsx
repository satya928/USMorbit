import { Badge } from "@/components/ui";

export function HealthBadge({ health }: { health: { score: number; band: "good" | "watch" | "at_risk"; reasons: readonly string[] } }) {
  const tone = health.band === "good" ? "green" : health.band === "watch" ? "amber" : "red";
  const label = health.band === "good" ? "Good" : health.band === "watch" ? "Watch" : "At risk";
  return (
    <span title={health.reasons.join("\n")}>
      <Badge tone={tone}>
        {health.score} · {label}
      </Badge>
    </span>
  );
}
