import { cn } from "@/lib/utils";

/** Carte standard : surface levée, coins doux, ombre discrète. */
export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-line bg-surface-raised p-6 shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}
