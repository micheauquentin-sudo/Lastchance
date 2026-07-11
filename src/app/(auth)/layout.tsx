import Link from "next/link";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
      <Link href="/" className="font-bold text-xl tracking-tight mb-8">
        Lastchance<span className="text-orange-600">.</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
