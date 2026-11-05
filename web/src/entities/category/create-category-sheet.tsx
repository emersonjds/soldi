"use client";

import { type FormEvent, useState } from "react";

import { toast } from "sonner";

import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { hasStatus, type Schemas } from "@/shared/api/client";
import { BrandButton } from "@/shared/ui/brand-button";
import { categoryBg } from "@/shared/ui/category-icon";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

import { useCategories, useCreateCategory } from "./categories-query";
import { IconPicker } from "./icon-picker";

type Kind = Schemas["CategoryKind"];
type Category = Schemas["Category"];

/** The twelve palette tokens with the names the swatches announce (docs/design/tokens.md). */
export const COLOR_NAMES: [token: string, name: string][] = [
  ["cat-1", "Âmbar"],
  ["cat-2", "Laranja"],
  ["cat-3", "Azul"],
  ["cat-4", "Vermelho"],
  ["cat-5", "Roxo"],
  ["cat-6", "Índigo"],
  ["cat-7", "Amarelo"],
  ["cat-8", "Ciano"],
  ["cat-9", "Rosa"],
  ["cat-10", "Violeta"],
  ["cat-11", "Verde"],
  ["cat-12", "Verde-claro"],
];

/** The first palette token the kind does not wear yet; the last one once all twelve are taken. */
const nextColor = (taken: Category[]) =>
  COLOR_NAMES.find(([token]) => !taken.some((category) => category.color === token))?.[0] ?? "cat-12";

const problemOf = (error: Error | null) => {
  if (!error) return undefined;
  return hasStatus(error, 409) ? "Já existe uma categoria com esse nome" : "Não foi possível criar a categoria.";
};

const CreateCategoryForm = ({ kind, onCreated }: { kind: Kind; onCreated: (category: Category) => void }) => {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("circle-dashed");
  const [parentId, setParentId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const categories = useCategories(kind);
  const list = categories.data ?? [];
  const [color, setColor] = useState<string>();
  const chosenColor = color ?? nextColor(list);
  const parents = list.filter((category) => !category.parent_id);
  const create = useCreateCategory();
  const trimmed = name.trim();
  const nameError = submitted && !trimmed ? "Informe o nome." : undefined;
  const problem = problemOf(create.error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // React bubbles the submit through the portal to the Lançar form around the picker.
    event.stopPropagation();
    setSubmitted(true);
    if (!trimmed) return;
    create.mutate(
      { name: trimmed, kind, icon, color: chosenColor, ...(parentId ? { parent_id: parentId } : {}) },
      { onSuccess: onCreated },
    );
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
      <Field className="gap-1.5">
        <FieldLabel htmlFor="category-parent">Subcategoria de</FieldLabel>
        <NativeSelect
          id="category-parent"
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
          className="h-12 w-full rounded-xl text-base [&>select]:h-12 [&>select]:rounded-xl [&>select]:pl-3 [&>select]:text-base"
        >
          <NativeSelectOption value="">Nenhuma</NativeSelectOption>
          {parents.map((parent) => (
            <NativeSelectOption key={parent.id} value={parent.id}>
              {parent.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <IconPicker value={icon} color={chosenColor} onChange={setIcon} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-sm">Cor</legend>
        <div className="flex flex-wrap gap-2">
          {COLOR_NAMES.map(([token, label]) => (
            <label
              key={token}
              className="group flex size-11 cursor-pointer items-center justify-center rounded-full has-focus-visible:outline-2 has-focus-visible:outline-ring"
            >
              <input
                type="radio"
                name="category-color"
                aria-label={`Cor ${label}`}
                className="sr-only"
                checked={chosenColor === token}
                onChange={() => setColor(token)}
              />
              <span
                aria-hidden
                className={cn(
                  "size-8 rounded-full transition-transform group-has-checked:scale-110 group-has-checked:ring-2 group-has-checked:ring-primary group-has-checked:ring-offset-2 group-has-checked:ring-offset-background",
                  categoryBg(token),
                )}
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

/** `Nova categoria`: name, optional parent, any lucide icon and a palette color; the kind is the picker's. */
export const CreateCategorySheet = ({
  kind,
  open,
  onOpenChange,
  onCreated,
}: {
  kind: Kind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (category: Category) => void;
}) => (
  <ResponsiveSheet
    open={open}
    onOpenChange={onOpenChange}
    title="Nova categoria"
    description="Nome, ícone e cor; subcategoria se quiser agrupar."
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
