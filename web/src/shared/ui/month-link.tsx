"use client";

import { type ComponentProps, Suspense } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { isMonth } from "@/shared/lib/date";

type LinkProps = ComponentProps<typeof Link> & { href: string };

const KeptMonthLink = ({ href, ...props }: LinkProps) => {
  const month = useSearchParams().get("m");
  if (!isMonth(month)) return <Link href={href} {...props} />;
  const [rest, hash] = href.split("#");
  const [path, query] = rest.split("?");
  const params = new URLSearchParams(query);
  params.set("m", month);
  return <Link href={`${path}?${params}${hash === undefined ? "" : `#${hash}`}`} {...props} />;
};

/** A link that keeps the viewed month (`?m=`, D21) while moving between pages. */
export const MonthLink = (props: LinkProps) => (
  <Suspense fallback={<Link {...props} />}>
    <KeptMonthLink {...props} />
  </Suspense>
);
