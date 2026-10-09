import { personColor } from "@/lib/colors";

type Props = {
  name: string;
  // Position in the alphabetical member list; -1 for unknown/unassigned.
  colorIndex: number;
  size?: "sm" | "md" | "lg";
};

const SIZES = { sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-10 w-10 text-sm" };

export function Avatar({ name, colorIndex, size = "md" }: Props) {
  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white ${SIZES[size]} ${personColor(colorIndex)}`}
    >
      {initials}
    </span>
  );
}
