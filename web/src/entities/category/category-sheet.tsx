"use client";

import { type FormEvent, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import { hasProblem, hasStatus, type Schemas } from "@/shared/api/client";
import { positiveAmount } from "@/shared/lib/money";
import { AmountInput } from "@/shared/ui/amount-input";
import { BrandButton } from "@/shared/ui/brand-button";
import { CategoryIcon, categoryBg } from "@/shared/ui/category-icon";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

import { systemCategoriesQuery, useCategories, useCreateCategory, useUpdateCategory } from "./categories-query";
import { ChooseKind, ChooseParent } from "./category-chooser";
import { IconPicker } from "./icon-picker";

type Kind = Schemas["CategoryKind"];
type Category = Schemas["Category"];

/** The 24 palette tokens with the names the swatches announce (docs/design/tokens.md). */
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
  ["cat-13", "Verde-azulado"],
  ["cat-14", "Framboesa"],
  ["cat-15", "Oliva"],
  ["cat-16", "Azul-petróleo"],
  ["cat-17", "Ameixa"],
  ["cat-18", "Marrom"],
  ["cat-19", "Ardósia"],
  ["cat-20", "Verde-escuro"],
  ["cat-21", "Vinho"],
  ["cat-22", "Telha"],
  ["cat-23", "Anil"],
  ["cat-24", "Malva"],
];

/** The other active top-level category of the kind that wears `token`; subcategories wear their parent's. */
const holderOf = (list: Category[], token: string, except?: string) =>
  list.find((each) => !each.parent_id && each.id !== except && each.color === token);

/** The first palette token no other top-level category of the kind wears; undefined once all 24 are taken. */
const freeColor = (list: Category[], except?: string) =>
  COLOR_NAMES.find(([token]) => !holderOf(list, token, except))?.[0];

const allTaken = (editing: boolean) =>
  `Todas as 24 cores estão em uso. ${editing ? "Mantenha" : "Crie"} como subcategoria ou arquive uma categoria.`;

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
  if (hasProblem(error, "color-taken")) return "Essa cor já é de outra categoria";
  if (hasProblem(error, "palette-full")) return allTaken(editing);
  return editing ? "Não foi possível salvar a categoria." : "Não foi possível criar a categoria.";
};

type FormProps = {
  kind: Kind;
  /** Given: the form edits it and offers `Excluir`. */
  category?: Category;
  /** The parent preselected when creating. */
  parentId?: string;
  /** Given: creating under a parent offers `Trocar`, which calls it. */
  onChangeParent?: () => void;
  onSaved: (category: Category) => void;
  onArchive: (category: Category) => void;
};

const CategoryForm = ({ kind, category, parentId: presetParent, onChangeParent, onSaved, onArchive }: FormProps) => {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon);
  const [movedTo, setParentId] = useState(category?.parent_id ?? "");
  const parentId = category ? movedTo : (presetParent ?? "");
  const [submitted, setSubmitted] = useState(false);
  const categories = useCategories(kind);
  const list = categories.data ?? [];
  const holders =
    useQuery({ ...systemCategoriesQuery, select: (all) => all.filter((each) => each.kind === kind) }).data ?? list;
  const [color, setColor] = useState(category?.color);
  const [target, setTarget] = useState(category?.target ?? "");
  const [deadline, setDeadline] = useState(category?.deadline ?? "");
  const parent = list.find((each) => each.id === parentId);
  const cofrinho = Boolean(parent?.is_savings);
  const chosenIcon = icon ?? parent?.icon ?? "circle-dashed";
  const free = freeColor(holders, category?.id);
  const ownColor = color && !holderOf(holders, color, category?.id) ? color : free;
  const chosenColor = parentId ? parent?.color : ownColor;
  const full = !parentId && !free;
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
        {
          id: category.id,
          name: trimmed,
          icon: chosenIcon,
          ...(parentId ? {} : { color: chosenColor }),
          parent_id: parentId || null,
          ...goal,
        },
        { onSuccess: onSaved },
      );
    create.mutate(
      {
        name: trimmed,
        kind,
        icon: chosenIcon,
        ...(parentId ? { parent_id: parentId } : { color: chosenColor }),
        ...goal,
      },
      { onSuccess: onSaved },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      {!category && parent && (
        <div className="flex items-center gap-3">
          <CategoryIcon icon={parent.icon} color={parent.color} className="size-8" />
          <span className="flex-1 font-medium">Em {parent.name}</span>
          {onChangeParent && (
            <Button type="button" variant="ghost" className="min-h-11 text-base text-primary" onClick={onChangeParent}>
              Trocar
            </Button>
          )}
        </div>
      )}
      <Field className="gap-1.5" data-invalid={Boolean(nameError)}>
        <FieldLabel htmlFor="category-name">Nome</FieldLabel>
        <Input
          id="category-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={cofrinho ? "Ex.: Viagem" : "Ex.: Academia"}
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
      {category && !hasChildren && !fixedParent && (
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
      <IconPicker value={chosenIcon} color={chosenColor ?? ""} onChange={setIcon} />
      {parent && (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <span aria-hidden className={cn("size-4 rounded-full", categoryBg(parent.color))} />
          Usa a cor de {parent.name}
        </p>
      )}
      {full && <p className="text-muted-foreground text-sm">{allTaken(Boolean(category))}</p>}
      {!parentId && !full && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-semibold text-sm">Cor</legend>
          <div className="flex flex-wrap gap-2">
            {COLOR_NAMES.map(([token, label]) => {
              const holder = holderOf(holders, token, category?.id);
              return (
                <label
                  key={token}
                  className="group flex size-11 cursor-pointer items-center justify-center rounded-full has-disabled:cursor-not-allowed has-disabled:opacity-40 has-focus-visible:outline-2 has-focus-visible:outline-ring"
                >
                  <input
                    type="radio"
                    name="category-color"
                    aria-label={holder ? `Cor ${label}, usada por ${holder.name}` : `Cor ${label}`}
                    className="sr-only"
                    disabled={Boolean(holder)}
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
              );
            })}
          </div>
        </fieldset>
      )}
      {problem && (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
      <BrandButton type="submit" disabled={mutation.isPending || full}>
        {category ? "Salvar" : "Criar"}
      </BrandButton>
      {category && !category.is_savings && (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 text-base text-destructive hover:text-destructive"
          onClick={() => onArchive(category)}
        >
          <Trash2 className="size-5" />
          Excluir
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
  const start = form.category || form.parentId ? "form" : "kind";
  const [step, setStep] = useState<"kind" | "parent" | "form">(start);
  const [chosen, setChosen] = useState(form.parentId);
  const [opened, setOpened] = useState(open);
  if (open !== opened) {
    setOpened(open);
    if (open) {
      setStep(start);
      setChosen(form.parentId);
    }
  }
  const find = (id?: string) => categories.data?.find((each) => each.id === id);
  const cofrinho = Boolean(find(form.category?.parent_id ?? chosen)?.is_savings);
  // A cofrinho started from Cofrinhos stays under Economia.
  const fixed = form.category || find(form.parentId)?.is_savings;
  const pick = (parentId?: string) => {
    setChosen(parentId);
    setStep("form");
  };
  const done = form.category ? "salv" : "criad";
  const saved = cofrinho ? `Cofrinho ${done}o` : `Categoria ${done}a`;
  const title = cofrinho
    ? `${form.category ? "Editar" : "Novo"} cofrinho`
    : `${form.category ? "Editar" : "Nova"} categoria`;
  const heading = {
    kind: ["Nova", "Categoria nova ou dentro de uma que já existe?"],
    parent: ["Subcategoria de qual categoria?", "Busque e escolha a categoria que vai agrupar a nova."],
    form: [title, "Nome, ícone e cor; subcategoria se quiser agrupar."],
  }[step];

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={heading[0]}
      description={heading[1]}
      onBack={step === "parent" ? () => setStep("kind") : undefined}
    >
      {step === "kind" && <ChooseKind onCategory={() => pick()} onSubcategory={() => setStep("parent")} />}
      {step === "parent" && <ChooseParent kind={form.kind} onPick={pick} />}
      <div hidden={step !== "form"}>
        <CategoryForm
          key={form.category?.id ?? "new"}
          {...form}
          parentId={chosen}
          onChangeParent={fixed ? undefined : () => setStep("parent")}
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
      </div>
    </ResponsiveSheet>
  );
};
