"use client";

import { type FormEvent, useState } from "react";

import { Archive } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { hasStatus, type Schemas } from "@/shared/api/client";
import { positiveAmount } from "@/shared/lib/money";
import { AmountInput } from "@/shared/ui/amount-input";
import { BrandButton } from "@/shared/ui/brand-button";
import { categoryBg } from "@/shared/ui/category-icon";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

import { useCategories, useCreateCategory, useUpdateCategory } from "./categories-query";
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

/** Names a new cofrinho can start from, with their icons. */
const SUGGESTIONS: [name: string, icon: string][] = [
  ["Reserva de emergência", "shield"],
  ["Viagem", "plane"],
  ["Carro", "car"],
  ["Casa", "home"],
  ["Estudos", "graduation-cap"],
];

const chip =
  "inline-flex min-h-11 items-center rounded-full bg-muted px-4 font-medium text-base transition-colors hover:bg-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-ring";

const field = "h-12 text-base md:text-base";

const problemOf = (error: Error | null, editing: boolean) => {
  if (!error) return undefined;
  if (hasStatus(error, 409)) return "Já existe uma categoria com esse nome";
  return editing ? "Não foi possível salvar a categoria." : "Não foi possível criar a categoria.";
};

type FormProps = {
  kind: Kind;
  /** Given: the form edits it and offers `Arquivar`. */
  category?: Category;
  /** The parent preselected when creating. */
  parentId?: string;
  onSaved: (category: Category) => void;
  onArchive: (category: Category) => void;
};

const CategoryForm = ({ kind, category, parentId: presetParent, onSaved, onArchive }: FormProps) => {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon);
  const [parentId, setParentId] = useState(category?.parent_id ?? presetParent ?? "");
  const [submitted, setSubmitted] = useState(false);
  const categories = useCategories(kind);
  const list = categories.data ?? [];
  const [color, setColor] = useState(category?.color);
  const [target, setTarget] = useState(category?.target ?? "");
  const [deadline, setDeadline] = useState(category?.deadline ?? "");
  const parent = list.find((each) => each.id === parentId);
  const cofrinho = Boolean(parent?.is_savings);
  const chosenIcon = icon ?? parent?.icon ?? "circle-dashed";
  // Cofrinhos tell themselves apart by color, so a new one takes a free color instead of Economia's.
  const chosenColor = color ?? (cofrinho ? undefined : parent?.color) ?? nextColor(list);
  const parents = list.filter((each) => !each.parent_id && each.id !== category?.id);
  const hasChildren = Boolean(category) && list.some((each) => each.parent_id === category?.id);
  // Economia cannot get a parent, and a cofrinho made from Cofrinhos stays under it.
  const fixedParent = category?.is_savings || list.find((each) => each.id === presetParent)?.is_savings;
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const mutation = category ? update : create;
  const trimmed = name.trim();
  const nameError = submitted && !trimmed ? "Informe o nome." : undefined;
  const problem = problemOf(mutation.error, Boolean(category));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // React bubbles the submit through the portal to the Lançar form around the picker.
    event.stopPropagation();
    setSubmitted(true);
    if (!trimmed) return;
    // Outside Economia the API refuses a goal, so only a cofrinho sends one.
    const goal = cofrinho ? { target: positiveAmount(target), deadline: deadline || null } : {};
    if (category)
      return update.mutate(
        { id: category.id, name: trimmed, icon: chosenIcon, color: chosenColor, parent_id: parentId || null, ...goal },
        { onSuccess: onSaved },
      );
    create.mutate(
      {
        name: trimmed,
        kind,
        icon: chosenIcon,
        color: chosenColor,
        ...(parentId ? { parent_id: parentId } : {}),
        ...goal,
      },
      { onSuccess: onSaved },
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
          className={field}
          aria-invalid={Boolean(nameError)}
        />
        {nameError && <FieldError>{nameError}</FieldError>}
      </Field>
      {cofrinho && !category && (
        <fieldset aria-label="Sugestões" className="-mt-2 flex flex-wrap gap-2">
          {SUGGESTIONS.map(([suggestion, suggestedIcon]) => (
            <button
              key={suggestion}
              type="button"
              className={chip}
              onClick={() => {
                setName(suggestion);
                setIcon(suggestedIcon);
              }}
            >
              {suggestion}
            </button>
          ))}
        </fieldset>
      )}
      {cofrinho && (
        <div className="grid grid-cols-2 gap-3">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="category-target">Meta</FieldLabel>
            <AmountInput
              id="category-target"
              value={target}
              onValueChange={setTarget}
              placeholder="Opcional"
              className={field}
            />
          </Field>
          <Field className="gap-1.5">
            <FieldLabel htmlFor="category-deadline">Prazo</FieldLabel>
            <Input
              id="category-deadline"
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              className={field}
            />
          </Field>
        </div>
      )}
      {!hasChildren && !fixedParent && (
        <Field className="gap-1.5">
          <FieldLabel htmlFor="category-parent">Subcategoria de</FieldLabel>
          <NativeSelect
            id="category-parent"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            className="w-full [&>select]:h-12 [&>select]:rounded-xl [&>select]:pl-3 [&>select]:text-base"
          >
            <NativeSelectOption value="">Nenhuma</NativeSelectOption>
            {parents.map((parent) => (
              <NativeSelectOption key={parent.id} value={parent.id}>
                {parent.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
      <IconPicker value={chosenIcon} color={chosenColor} onChange={setIcon} />
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
      <BrandButton type="submit" disabled={mutation.isPending}>
        {category ? "Salvar" : "Criar"}
      </BrandButton>
      {category && !category.is_savings && (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 text-base text-destructive hover:text-destructive"
          onClick={() => onArchive(category)}
        >
          <Archive className="size-5" />
          Arquivar
        </Button>
      )}
    </form>
  );
};

type CategorySheetProps = Omit<FormProps, "onSaved" | "onArchive"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (category: Category) => void;
  onArchive?: (category: Category) => void;
};

/**
 * `Nova categoria` or `Editar categoria`: name, optional parent, any lucide icon and a palette color; the kind is fixed.
 * Under Economia it is a cofrinho: `Novo cofrinho` or `Editar cofrinho`, with an optional goal and deadline.
 */
export const CategorySheet = ({ open, onOpenChange, onSaved, onArchive, ...form }: CategorySheetProps) => {
  const categories = useCategories(form.kind);
  const parentId = form.category?.parent_id ?? form.parentId;
  const cofrinho = Boolean(categories.data?.find((each) => each.id === parentId)?.is_savings);
  const done = form.category ? "salv" : "criad";
  const saved = cofrinho ? `Cofrinho ${done}o` : `Categoria ${done}a`;
  const title = cofrinho
    ? `${form.category ? "Editar" : "Novo"} cofrinho`
    : `${form.category ? "Editar" : "Nova"} categoria`;

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Nome, ícone e cor; subcategoria se quiser agrupar."
    >
      <CategoryForm
        key={form.category?.id ?? form.parentId ?? "new"}
        {...form}
        onSaved={(category) => {
          onOpenChange(false);
          toast.success(saved);
          onSaved?.(category);
        }}
        onArchive={(category) => {
          onOpenChange(false);
          onArchive?.(category);
        }}
      />
    </ResponsiveSheet>
  );
};
