import { type CSSProperties, lazy, Suspense } from "react";

import {
  BookOpen,
  Briefcase,
  Building2,
  Car,
  CircleDashed,
  CreditCard,
  Droplets,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  type LucideIcon,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Repeat,
  Scissors,
  Shield,
  Shirt,
  ShoppingCart,
  Smartphone,
  Sofa,
  Sparkles,
  Undo2,
  Utensils,
  Wifi,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** The default categories' icons ship in the bundle; any other lucide name loads on demand below. */
export const BUNDLED_ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  briefcase: Briefcase,
  "building-2": Building2,
  car: Car,
  "circle-dashed": CircleDashed,
  "credit-card": CreditCard,
  droplets: Droplets,
  fuel: Fuel,
  "gamepad-2": Gamepad2,
  gift: Gift,
  "graduation-cap": GraduationCap,
  "heart-pulse": HeartPulse,
  home: House,
  landmark: Landmark,
  "paw-print": PawPrint,
  "piggy-bank": PiggyBank,
  pill: Pill,
  plane: Plane,
  receipt: Receipt,
  repeat: Repeat,
  scissors: Scissors,
  shield: Shield,
  shirt: Shirt,
  "shopping-cart": ShoppingCart,
  smartphone: Smartphone,
  sofa: Sofa,
  sparkles: Sparkles,
  "undo-2": Undo2,
  utensils: Utensils,
  wifi: Wifi,
  zap: Zap,
};

const DynamicIcon = lazy(() => import("lucide-react/dynamic").then((module) => ({ default: module.DynamicIcon })));

/** Any lucide icon by name: bundled ones render at once, the rest after their chunk loads. */
export const LucideByName = ({ name, className }: { name: string; className?: string }) => {
  const Bundled = BUNDLED_ICONS[name];
  if (Bundled) return <Bundled className={className} />;
  const fallback = <CircleDashed className={className} />;
  return (
    <Suspense fallback={fallback}>
      <DynamicIcon name={name as never} fallback={() => fallback} className={className} />
    </Suspense>
  );
};

const COLORS: Record<string, string> = {
  "cat-1": "bg-cat-1",
  "cat-2": "bg-cat-2",
  "cat-3": "bg-cat-3",
  "cat-4": "bg-cat-4",
  "cat-5": "bg-cat-5",
  "cat-6": "bg-cat-6",
  "cat-7": "bg-cat-7",
  "cat-8": "bg-cat-8",
  "cat-9": "bg-cat-9",
  "cat-10": "bg-cat-10",
  "cat-11": "bg-cat-11",
  "cat-12": "bg-cat-12",
  "cat-13": "bg-cat-13",
  "cat-14": "bg-cat-14",
  "cat-15": "bg-cat-15",
  "cat-16": "bg-cat-16",
  "cat-17": "bg-cat-17",
  "cat-18": "bg-cat-18",
  "cat-19": "bg-cat-19",
  "cat-20": "bg-cat-20",
  "cat-21": "bg-cat-21",
  "cat-22": "bg-cat-22",
  "cat-23": "bg-cat-23",
  "cat-24": "bg-cat-24",
};

/** The category's color as a background class; an unknown token falls back to muted. */
export const categoryBg = (color: string) => COLORS[color] ?? "bg-muted-foreground";

/** The same color for an SVG fill (charts); the preset's variable, since `@theme inline` emits no `--color-*`. */
export const categoryFill = (color: string) => (COLORS[color] ? `var(--${color})` : "var(--muted-foreground)");

/** A solid circle; `tintedOnDesktop` turns it into the color at 15% with the glyph in the color from 1024 px. */
export const CategoryIcon = ({
  icon,
  color,
  tintedOnDesktop,
  className,
}: {
  icon: string;
  color: string;
  tintedOnDesktop?: boolean;
  className?: string;
}) => (
  <span
    aria-hidden
    style={tintedOnDesktop ? ({ "--cat": categoryFill(color) } as CSSProperties) : undefined}
    className={cn(
      "flex size-10 shrink-0 items-center justify-center rounded-full text-white",
      categoryBg(color),
      tintedOnDesktop && "lg:bg-(--cat)/15 lg:text-(--cat)",
      className,
    )}
  >
    <LucideByName name={icon} className="size-5" />
  </span>
);
