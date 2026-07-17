"use client";

import { useRef } from "react";
import { switchActiveOrganization } from "@/actions/organizations";

interface OrganizationOption {
  id: string;
  name: string;
}

export function OrganizationSwitcher({
  activeId,
  organizations,
}: {
  activeId: string;
  organizations: OrganizationOption[];
}) {
  const formRef = useRef<HTMLFormElement>(null);

  if (organizations.length < 2) return null;

  return (
    <form ref={formRef} action={switchActiveOrganization}>
      <label htmlFor="active-organization" className="sr-only">
        Établissement actif
      </label>
      <select
        id="active-organization"
        name="organizationId"
        defaultValue={activeId}
        onChange={() => formRef.current?.requestSubmit()}
        className="w-full rounded-xl border border-orange-900/10 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
      >
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.id}>
            {organization.name}
          </option>
        ))}
      </select>
    </form>
  );
}
