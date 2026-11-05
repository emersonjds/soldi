"use client";

import { type FormEvent, useState } from "react";

import { toast } from "sonner";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { hasStatus, type Schemas } from "@/shared/api/client";
import { BrandButton } from "@/shared/ui/brand-button";
import { CategoryIcon } from "@/shared/ui/category-icon";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

import { useCategories, useCreateCategory } from "./categories-query";

type Kind = Schemas["CategoryKind"];

const ICONS: [icon: string, label: string][] = [
  ["circle-dashed", "Padrão"],
  ["shopping-cart", "Compras"],
  ["utensils", "Comida"],
  ["car", "Carro"],
  ["fuel", "Combustível"],
  ["home", "Casa"],
  ["zap", "Energia"],
  ["wifi", "Internet"],
  ["smartphone", "Celular"],
  ["heart-pulse", "Saúde"],
  ["graduation-cap", "Educação"],
  ["gamepad-2", "Lazer"],
  ["plane", "Viagem"],
  ["gift", "Presente"],
  ["paw-print", "Pets"],
  ["briefcase", "Trabalho"],
];

const PALETTE = Array.from({ length: 12 }, (_, index) => `cat-${index + 1}`);

/** The first palette token the kind does not wear yet; `null` lets the server pick once all twelve are taken. */
const nextColor = (taken: Schemas["Category"][]) =>
  PALETTE.find((color) => !taken.some((category) => category.color === color)) ?? null;

const problemOf = (error: Error | null) => {
  if (!error) return undefined;
  return hasStatus(error, 409) ? "Já existe uma categoria com esse nome" : "Não foi possível criar a categoria.";
};

const CreateCategoryForm = ({
  kind,
  onCreated,
}: {
  kind: Kind;
  onCreated: (category: Schemas["Category"]) => void;
}) => {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("circle-dashed");
  const [submitted, setSubmitted] = useState(false);
  const categories = useCategories(kind);
  const create = useCreateCategory();
  const color = nextColor(categories.data ?? []);
  const trimmed = name.trim();
  const nameError = submitted && !trimmed ? "Informe o nome." : undefined;
  const problem = problemOf(create.error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // React bubbles the submit through the portal to the Lançar form around the picker.
    event.stopPropagation();
    setSubmitted(true);
    if (!trimmed) return;
    create.mutate({ name: trimmed, kind, icon, color }, { onSuccess: onCreated });
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <Field className="gap-1.5" data-invalid={Boolean(nameError)}>
        <FieldLabel htmlFor="category-name">Nome</FieldLabel>
        <Input
          id="category-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Academia"
          maxLength={40}
          autoComplete="off"
          className="h-12 text-base md:text-base"
          aria-invalid={Boolean(nameError)}
        />
        {nameError && <FieldError>{nameError}</FieldError>}
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-sm">Ícone</legend>
        <div className="grid grid-cols-4 gap-2">
          {ICONS.map(([value, label]) => (
            <label
              key={value}
              className="group flex min-h-14 cursor-pointer items-center justify-center rounded-xl has-checked:bg-muted has-focus-visible:outline-2 has-focus-visible:outline-ring"
            >
              <input
                type="radio"
                name="category-icon"
                aria-label={label}
                className="sr-only"
                checked={icon === value}
                onChange={() => setIcon(value)}
              />
              <CategoryIcon
                icon={value}
                color={color ?? ""}
                className="size-11 opacity-50 transition-opacity group-has-checked:opacity-100 group-has-checked:ring-2 group-has-checked:ring-primary group-has-checked:ring-offset-2 group-has-checked:ring-offset-muted"
              />
            </label>
          ))}
        </div>
      </fieldset>
      {problem && (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
      <BrandButton type="submit" disabled={create.isPending}>
        Criar
      </BrandButton>
    </form>
  );
};

/** `Nova categoria`: name and icon; the kind is the picker's and the color the next free one. */
export const CreateCategorySheet = ({
  kind,
  open,
  onOpenChange,
  onCreated,
}: {
  kind: Kind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (category: Schemas["Category"]) => void;
}) => (
  <ResponsiveSheet
    open={open}
    onOpenChange={onOpenChange}
    title="Nova categoria"
    description="Nome e ícone da categoria; a cor vem sozinha."
  >
    <CreateCategoryForm
      kind={kind}
      onCreated={(category) => {
        onOpenChange(false);
        toast.success("Categoria criada");
        onCreated(category);
      }}
    />
  </ResponsiveSheet>
);
