import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { getUserAndOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/env";
import { PrintButton } from "@/components/dashboard/print-button";
import type { QrCode } from "@/types/database";

export const metadata: Metadata = { title: "Affiche à imprimer" };

/**
 * Affiche imprimable (A4 portrait) pour un QR code : le commerçant
 * l'imprime et la pose en salle, en caisse ou sur les tables.
 */
export default async function PosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, organization } = await getUserAndOrg();
  if (!user) redirect("/login");
  if (!organization) redirect("/onboarding");

  const supabase = await createClient();
  const { data } = await supabase
    .from("qr_codes")
    .select("*")
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!data) notFound();
  const qr = data as QrCode;

  const url = `${APP_URL}/play/${qr.slug}`;
  const dataUrl = await QRCode.toDataURL(url, {
    width: 1024,
    margin: 1,
    color: { dark: "#18181b", light: "#ffffff" },
  });

  return (
    <div className="min-h-screen bg-zinc-100 print:bg-white">
      <div className="print:hidden flex items-center justify-between gap-4 px-6 py-4 border-b border-zinc-200 bg-white">
        <Link
          href="/dashboard/qr-codes"
          className="text-sm text-zinc-500 hover:text-zinc-900"
        >
          ← QR codes
        </Link>
        <PrintButton />
      </div>

      {/* Affiche — format A4 portrait à l'impression */}
      <div className="mx-auto my-8 print:my-0 max-w-130 rounded-2xl print:rounded-none border border-zinc-200 print:border-0 bg-white shadow-sm print:shadow-none px-10 py-14 text-center flex flex-col items-center gap-8">
        <div>
          <p className="text-sm uppercase tracking-widest text-zinc-500">
            {organization.name}
          </p>
          <h1 className="text-4xl font-extrabold mt-3 leading-tight">
            Tentez votre chance&nbsp;!
          </h1>
          <p className="text-lg text-zinc-600 mt-2">
            Tournez la roue, gagnez un cadeau.
          </p>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUrl}
          alt={`QR code — ${url}`}
          className="w-64 h-64 rounded-xl border border-zinc-200"
        />

        <ol className="text-left text-zinc-700 space-y-2">
          {[
            "Scannez le QR code avec votre téléphone",
            "Tournez la roue",
            "Montrez votre gain en caisse",
          ].map((step, i) => (
            <li key={step} className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white text-sm font-bold">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>

        <p className="text-xs text-zinc-400">
          Jeu gratuit sans obligation d&apos;achat
          {qr.label ? ` · ${qr.label}` : ""}
        </p>
      </div>
    </div>
  );
}
