"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { createOrganization } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import {
  parseLocalStudioDraft,
  studioModuleLabel,
  type ParsedStudioDraft,
} from "@/lib/studio-draft-import";

const EMPTY_SUBSCRIBE = () => () => {};
let cachedKey: string | null = null;
let cachedDraft: ParsedStudioDraft | null = null;

function readClientStudioDraft(): ParsedStudioDraft | null {
  try {
    const rawDraft =
      window.localStorage.getItem("lc_studio_draft") ??
      window.localStorage.getItem("lc_studio_drafts_v1");
    const rawMod = window.localStorage.getItem("lc_active_module");
    const key = `${rawDraft ?? ""}\0${rawMod ?? ""}`;
    if (key === cachedKey) return cachedDraft;
    cachedKey = key;
    cachedDraft = parseLocalStudioDraft(rawDraft, rawMod);
    return cachedDraft;
  } catch {
    return null;
  }
}

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState(createOrganization, null);
  const storedDraft = useSyncExternalStore(
    EMPTY_SUBSCRIBE,
    readClientStudioDraft,
    () => null,
  );
  const [dismissed, setDismissed] = useState(false);
  const [editedName, setEditedName] = useState<string | null>(null);

  const activeDraft = dismissed ? null : storedDraft;
  const orgName = editedName ?? activeDraft?.organizationName ?? "";
  const studioModule = activeDraft?.activeModule ?? null;

  function clearStudioDraft() {
    setDismissed(true);
    setEditedName("");
    try {
      window.localStorage.removeItem("lc_studio_draft");
      window.localStorage.removeItem("lc_studio_drafts_v1");
      window.localStorage.removeItem("lc_active_module");
    } catch {
      // Ignore
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      {activeDraft && (
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-950 flex items-start justify-between gap-2">
          <div>
            <strong className="font-semibold block text-purple-900">
              Brouillon Studio détecté
              {studioModule ? ` · ${studioModuleLabel(studioModule)}` : ""}
            </strong>
            <span className="text-purple-800">
              Nom pré-rempli et redirection directe vers votre module après création.
            </span>
          </div>
          <button
            type="button"
            onClick={clearStudioDraft}
            className="text-purple-700 hover:underline shrink-0 font-medium"
          >
            Ignorer
          </button>
        </div>
      )}
      {studioModule && (
        <input type="hidden" name="studioModule" value={studioModule} />
      )}
      <div>
        <Label htmlFor="organizationName">Nom de l&apos;établissement</Label>
        <Input
          id="organizationName"
          name="organizationName"
          required
          maxLength={120}
          placeholder="Chez Marco"
          value={orgName}
          onChange={(e) => setEditedName(e.target.value)}
          autoFocus
        />
      </div>
      <FieldError message={state && !state.ok ? state.error : undefined} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Création…" : "Créer mon espace"}
      </Button>
    </form>
  );
}
