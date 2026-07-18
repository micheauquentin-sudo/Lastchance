"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Lien public du championnat + copie en un clic (affiché au commerçant). */
export function ContestShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-k-ink break-all">
        {url}
      </code>
      <Button
        type="button"
        variant="secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Presse-papiers indisponible (permissions) : l'URL reste copiable à la main.
          }
        }}
      >
        {copied ? "Copié !" : "Copier le lien"}
      </Button>
    </div>
  );
}
