"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { CategoryIcon } from "@/shared/ui/category-icon";

/** Shown before the user searches: the default categories' icons first, then common ones by theme. */
export const SUGGESTED = [
  "circle-dashed",
  "shopping-cart",
  "utensils",
  "car",
  "fuel",
  "home",
  "zap",
  "wifi",
  "smartphone",
  "heart-pulse",
  "users",
  "graduation-cap",
  "gamepad-2",
  "plane",
  "gift",
  "paw-print",
  "briefcase",
  "credit-card",
  "shopping-bag",
  "receipt",
  "piggy-bank",
  "landmark",
  "bus",
  "pill",
  "coffee",
  "bike",
  "car-taxi-front",
  "key-round",
  "hammer",
  "droplets",
  "flame",
  "wallet",
  "hand-coins",
  "calculator",
  "stethoscope",
  "brain",
  "dumbbell",
  "baby",
  "languages",
  "book-open",
  "film",
  "music",
  "tv",
  "shirt",
  "scissors",
  "laptop",
];

const PAGE = 24;

/** Every lucide name, loaded once the user starts typing so the list never ships in the main bundle. */
const useIconNames = (wanted: boolean) => {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!wanted || names.length) return;
    void import("lucide-react/dynamic").then((module) => setNames(module.iconNames));
  }, [wanted, names.length]);
  return names;
};

export const IconPicker = ({
  value,
  color,
  onChange,
}: {
  value: string;
  color: string;
  onChange: (icon: string) => void;
}) => {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const term = query.trim().toLowerCase();
  const all = useIconNames(term.length > 0);
  const matches = term ? all.filter((name) => name.includes(term)) : SUGGESTED;
  const shown = matches.slice(0, limit);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold text-sm">Ícone Representativo</legend>
      <Input
        type="search"
        aria-label="Buscar ícone"
        placeholder="Buscar entre todos os ícones"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setLimit(PAGE);
        }}
        className="h-12 text-base md:text-base"
      />
      <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Ícone">
        {shown.map((name) => (
          <label
            key={name}
            className="group flex min-h-14 cursor-pointer items-center justify-center rounded-xl has-checked:bg-muted has-focus-visible:outline-2 has-focus-visible:outline-ring"
          >
            <input
              type="radio"
              name="category-icon"
              aria-label={`Ícone ${name}`}
              className="sr-only"
              checked={value === name}
              onChange={() => onChange(name)}
            />
            <CategoryIcon
              icon={name}
              color={color}
              className="size-11 opacity-50 transition-opacity group-has-checked:opacity-100 group-has-checked:ring-2 group-has-checked:ring-primary group-has-checked:ring-offset-2 group-has-checked:ring-offset-muted"
            />
          </label>
        ))}
      </div>
      {term && all.length === 0 && <p className="text-muted-foreground text-sm">Carregando ícones…</p>}
      {term && all.length > 0 && matches.length === 0 && (
        <p className="text-muted-foreground text-sm">Nenhum ícone com esse nome.</p>
      )}
      {matches.length > limit && (
        <button
          type="button"
          onClick={() => setLimit(limit + PAGE)}
          className="min-h-11 rounded-xl font-semibold text-primary text-sm"
        >
          Mais ícones
        </button>
      )}
    </fieldset>
  );
};
