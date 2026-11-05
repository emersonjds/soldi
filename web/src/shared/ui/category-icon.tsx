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

// ponytail: the icons of the default categories only; a custom icon name draws the dashed circle until a picker exists.
const ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  briefcase: Briefcase,
  "building-2": Building2,
  car: Car,
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
};

/** The category's color as a background class; an unknown token falls back to muted. */
export const categoryBg = (color: string) => COLORS[color] ?? "bg-muted-foreground";

/** The same color for an SVG fill (charts); the preset's variable, since `@theme inline` emits no `--color-*`. */
export const categoryFill = (color: string) => (COLORS[color] ? `var(--${color})` : "var(--muted-foreground)");

export const CategoryIcon = ({ icon, color, className }: { icon: string; color: string; className?: string }) => {
  const Icon = ICONS[icon] ?? CircleDashed;
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full text-white",
        categoryBg(color),
        className,
      )}
    >
      <Icon className="size-5" />
    </span>
  );
};
