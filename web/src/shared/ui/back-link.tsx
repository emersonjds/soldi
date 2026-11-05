import Link from "next/link";

import { ChevronLeft } from "lucide-react";

/** The way up from a sub-screen, sized for a thumb. */
export const BackLink = ({ href, label }: { href: string; label: string }) => (
  <Link
    href={href}
    className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg pr-3 pl-1 font-medium text-primary hover:bg-muted"
  >
    <ChevronLeft className="size-5" aria-hidden />
    {label}
  </Link>
);
