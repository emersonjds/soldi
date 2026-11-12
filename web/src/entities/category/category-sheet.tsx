"use client";

import { type FormEvent, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Check, Palette, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { hasProblem, hasStatus, problemMessage, type Schemas } from "@/shared/api/client";
import { positiveAmount } from "@/shared/lib/money";
import { AmountInput } from "@/shared/ui/amount-input";
import { BrandButton } from "@/shared/ui/brand-button";
import { CategoryIcon, categoryBg } from "@/shared/ui/category-icon";
import { DateField } from "@/shared/ui/date-field";
import { ResponsiveSheet } from "@/shared/ui/responsive-sheet";

import {
  categoriesQuery,
  kindsOf,
  ofKind,
  systemCategoriesQuery,
  useCreateCategory,
  useUpdateCategory,
} from "./categories-query";
import { sameSide } from "./category-chooser";
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

/** The other active top-level category in the kinds that wears `token`; subcategories wear their parent's. */
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

const OUTFLOW_KINDS: [kind: Kind, label: string][] = [
  ["daily", "Diário"],
  ["bill", "Fixa"],
];

const FLOW_KINDS: [kind: Kind, label: string][] = [...OUTFLOW_KINDS, ["income", "Entrada"]];

const kindLabel = (kind: Kind) => OUTFLOW_KINDS.find(([each]) => each === kind)?.[1];

const kindProblemOf = (error: Error) => {
  const message = problemMessage(error);
  if (message) return message;
  if (hasProblem(error, "palette-full"))
    return "Todas as 24 cores estão em uso no outro tipo. Arquive uma categoria e tente de novo.";
  if (hasStatus(error, 404)) return "Essa categoria não existe mais.";
  return "Não foi possível mudar o tipo.";
};

const kindChip =
  "h-11 rounded-xl! font-semibold text-base text-muted-foreground data-[state=on]:bg-brand data-[state=on]:text-brand-foreground data-[state=on]:shadow-sm";

const segment =
  "h-11 rounded-xl! font-semibold text-base text-muted-foreground data-[state=on]:bg-card data-[state=on]:text-primary data-[state=on]:shadow-sm";

type FormProps = {
  kind: Kind;
  /** Given: the form edits it and offers `Excluir`. */
  category?: Category;
  /** The parent preselected when creating: the form opens in Subcategoria mode. */
  parentId?: string;
  onSaved: (category: Category) => void;
  onArchive: (category: Category) => void;
  /** Called with the new kind once the API moved or created the category there; given, creating offers `Tipo de Fluxo`. */
  onKindChange?: (kind: Kind) => void;
};

const CategoryForm = ({ kind, category, parentId: presetParent, onSaved, onArchive, onKindChange }: FormProps) => {
  const [name, setName] = useState(category?.name ?? "");
  const [ownKind, setOwnKind] = useState(category?.kind);
  const [asking, setAsking] = useState(false);
  const [nextKind, setNextKind] = useState<Kind>("bill");
  const [icon, setIcon] = useState(category?.icon);
  const [movedTo, setParentId] = useState(category?.parent_id ?? "");
  const [sub, setSub] = useState(Boolean(presetParent));
  const [picked, setPicked] = useState(presetParent ?? "");
  const [flow, setFlow] = useState(kind);
  const [submitted, setSubmitted] = useState(false);
  // Edited from another kind's list (D26), a category keeps its own kind.
  const formKind = ownKind ?? flow;
  const list = useQuery(categoriesQuery).data ?? [];
  const parents = list.filter((each) => !each.parent_id && each.id !== category?.id && sameSide(each, formKind));
  const offered = parents.some((each) => each.id === picked);
  const linked = sub && offered ? picked : "";
  const parentId = category ? movedTo : linked;
  const system = useQuery(systemCategoriesQuery).data ?? list;
  const holders = (category ? kindsOf({ ...category, kind: formKind }, system) : [formKind]).flatMap((each) =>
    ofKind(system, each),
  );
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
  const hasChildren = Boolean(category) && list.some((each) => each.parent_id === category?.id);
  // Economia cannot get a parent, and a cofrinho made from Cofrinhos stays under it.
  const fixedParent = category?.is_savings || list.find((each) => each.id === presetParent)?.is_savings;
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const move = useUpdateCategory();
  const mutation = category ? update : create;
  // The API refuses a kind on Economia, its cofrinhos, Resgate and income categories.
  const kindChangeable =
    category &&
    formKind !== "income" &&
    !category.is_savings &&
    !list.find((each) => each.id === category.parent_id)?.is_savings;

  const askKind = (next: Kind | "") => {
    if (!next) return;
    setNextKind(next);
    move.reset();
    setAsking(true);
  };

  const changeKind = (id: string) => (event: { preventDefault: () => void }) => {
    event.preventDefault();
    move.mutate(
      { id, kind: nextKind },
      {
        onSuccess: () => {
          setOwnKind(nextKind);
          setAsking(false);
          onKindChange?.(nextKind);
        },
      },
    );
  };
  const trimmed = name.trim();
  const nameError = submitted && !trimmed ? "Informe o nome." : undefined;
  const parentError = submitted && !category && sub && !parentId ? "Escolha a categoria pai." : undefined;
  const swatches = [
    ...COLOR_NAMES.filter(([token]) => token === chosenColor),
    ...COLOR_NAMES.filter(([token]) => token !== chosenColor && !holderOf(holders, token, category?.id)),
  ];
  const creatingFlow = !category && onKindChange && !fixedParent;
  const action = category ? "Salvar" : "Criar";
  const problem = problemOf(mutation.error, Boolean(category));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // React bubbles the submit through the portal to the Lançar form around the picker.
    event.stopPropagation();
    setSubmitted(true);
    if (!trimmed || (!category && sub && !parentId)) return;
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
        kind: formKind,
        icon: chosenIcon,
        ...(parentId ? { parent_id: parentId } : { color: chosenColor }),
        ...goal,
      },
      {
        onSuccess: (created) => {
          onSaved(created);
          if (formKind !== kind) onKindChange?.(formKind);
        },
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      {!category && !fixedParent && (
        <ToggleGroup
          type="single"
          spacing={0}
          value={sub ? "sub" : "top"}
          onValueChange={(value) => value && setSub(value === "sub")}
          aria-label="Categoria Pai ou Subcategoria"
          className="grid w-full grid-cols-2 rounded-2xl bg-muted p-1"
        >
          <ToggleGroupItem value="top" className={segment}>
            Categoria Pai
          </ToggleGroupItem>
          <ToggleGroupItem value="sub" className={segment}>
            Subcategoria
          </ToggleGroupItem>
        </ToggleGroup>
      )}
      <Field className="gap-1.5" data-invalid={Boolean(nameError)}>
        <FieldLabel htmlFor="category-name">Nome do agrupador</FieldLabel>
        <Input
          id="category-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={cofrinho ? "Ex.: Viagem" : "Ex: Educação & Cursos"}
          maxLength={40}
          autoComplete="off"
          className={field}
          aria-invalid={Boolean(nameError)}
        />
        {nameError && <FieldError>{nameError}</FieldError>}
      </Field>
      {creatingFlow && (
        <div className="flex flex-col gap-1.5">
          <FieldTitle id="category-flow">Tipo de Fluxo</FieldTitle>
          <ToggleGroup
            type="single"
            spacing={0}
            value={flow}
            onValueChange={(value: Kind | "") => value && setFlow(value)}
            aria-labelledby="category-flow"
            className="grid w-full grid-cols-3 gap-2"
          >
            {FLOW_KINDS.map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} className={cn(kindChip, "bg-muted")}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      {kindChangeable && (
        <div className="flex flex-col gap-1.5">
          <FieldTitle id="category-kind">Tipo de Fluxo</FieldTitle>
          <ToggleGroup
            type="single"
            spacing={0}
            value={formKind}
            onValueChange={askKind}
            aria-labelledby="category-kind"
            className="grid w-full grid-cols-2 rounded-2xl bg-muted p-1"
          >
            {OUTFLOW_KINDS.map(([value, label]) => (
              <ToggleGroupItem key={value} value={value} className={kindChip}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <AlertDialog open={asking} onOpenChange={setAsking}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{`Mudar para ${kindLabel(nextKind)}?`}</AlertDialogTitle>
                <AlertDialogDescription>
                  {`Todos os lançamentos de ${category.name} passam a ser ${kindLabel(nextKind)}. O saldo não muda.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {move.error && (
                <p role="alert" className="text-destructive text-sm">
                  {kindProblemOf(move.error)}
                </p>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11 text-base">Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="min-h-11 text-base"
                  disabled={move.isPending}
                  onClick={changeKind(category.id)}
                >
                  Mudar tipo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
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
            <DateField id="category-deadline" label="Prazo" value={deadline} onChange={setDeadline} className={field} />
            {deadline && (
              <button
                type="button"
                onClick={() => setDeadline("")}
                className="inline-flex min-h-11 items-center self-start font-semibold text-primary text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
              >
                Remover prazo
              </button>
            )}
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
      {!category && sub && !fixedParent && (
        <div className="flex flex-col gap-2">
          <span id="category-parents" className="font-semibold text-sm">
            Vincular à Categoria Pai
          </span>
          <div role="radiogroup" aria-labelledby="category-parents" className="flex flex-col gap-1">
            {parents.map((each) => (
              <label
                key={each.id}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 has-checked:bg-secondary has-focus-visible:outline-2 has-focus-visible:outline-ring"
              >
                <input
                  type="radio"
                  name="category-parent"
                  className="sr-only"
                  checked={picked === each.id}
                  onChange={() => setPicked(each.id)}
                />
                <CategoryIcon icon={each.icon} color={each.color} className="size-8" />
                <span className="text-base">{each.name}</span>
              </label>
            ))}
            {parents.length === 0 && <p className="text-muted-foreground text-sm">Nenhuma categoria pai deste tipo.</p>}
          </div>
          {parentError && (
            <p role="alert" className="text-destructive text-sm">
              {parentError}
            </p>
          )}
        </div>
      )}
      {parent && (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <span aria-hidden className={cn("size-4 rounded-full", categoryBg(parent.color))} />
          Usa a cor de {parent.name}
        </p>
      )}
      {full && <p className="text-muted-foreground text-sm">{allTaken(Boolean(category))}</p>}
      {!parentId && !full && (
        <fieldset aria-labelledby="category-color" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span id="category-color" className="font-semibold text-sm">
              Cor de Destaque
            </span>
            <span className="font-semibold text-primary text-sm">
              {COLOR_NAMES.find(([token]) => token === chosenColor)?.[1]}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {swatches.map(([token, label]) => {
              return (
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
      <IconPicker value={chosenIcon} color={chosenColor ?? ""} onChange={setIcon} />
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/50 p-3">
        <CategoryIcon icon={chosenIcon} color={chosenColor ?? ""} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-base">{trimmed}</span>
          <span className="text-muted-foreground text-xs">Prévia em tempo real</span>
        </div>
        {!category && (
          <span className="rounded-full bg-income-soft px-2.5 py-0.5 font-semibold text-income-text text-xs">Novo</span>
        )}
      </div>
      <BrandButton type="submit" disabled={mutation.isPending || full}>
        {!cofrinho && <Check />}
        {cofrinho ? action : `${action} Categoria`}
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
  onCloseAutoFocus?: (event: Event) => void;
};

/** The title and the saved toast: a category's, or a cofrinho's under Economia. */
const useHeading = ({ category, parentId }: Pick<FormProps, "category" | "parentId">) => {
  const list = useQuery(categoriesQuery).data;
  const cofrinho = Boolean(list?.find((each) => each.id === (category?.parent_id ?? parentId))?.is_savings);
  const done = category ? "salv" : "criad";
  return {
    title: cofrinho ? `${category ? "Editar" : "Novo"} cofrinho` : `${category ? "Editar" : "Nova"} Categoria`,
    saved: cofrinho ? `Cofrinho ${done}o` : `Categoria ${done}a`,
  };
};

const formKey = ({ category, parentId }: Pick<FormProps, "category" | "parentId">) =>
  category?.id ?? `new-${parentId ?? ""}`;

/**
 * `Nova Categoria` or `Editar Categoria`: Categoria Pai or Subcategoria, name, kind, icon and a free palette color.
 * Editing a Diário or Fixa category offers `Tipo de Fluxo`, which moves it and its entries after a confirmation.
 * Under Economia it is a cofrinho: `Novo cofrinho` or `Editar cofrinho`, with an optional goal and deadline.
 */
export const CategorySheet = ({
  open,
  onOpenChange,
  onSaved,
  onArchive,
  onCloseAutoFocus,
  ...form
}: CategorySheetProps) => {
  const { title, saved } = useHeading(form);
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Nome, ícone e cor; subcategoria se quiser agrupar."
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <CategoryForm
        key={formKey(form)}
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

/** The same form as a side panel, from 1280 px on Categorias. */
export const CategoryPanel = ({ onSaved, ...form }: FormProps) => {
  const { title, saved } = useHeading(form);
  return (
    <aside aria-labelledby="category-panel-title" className="flex flex-col gap-5 rounded-2xl bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Palette aria-hidden className="size-5 text-primary" />
        <h2 id="category-panel-title" className="font-bold text-lg">
          {title}
        </h2>
        <span className="rounded-full bg-muted px-2.5 py-0.5 font-medium text-muted-foreground text-xs">
          Configuração
        </span>
      </div>
      <CategoryForm
        key={formKey(form)}
        {...form}
        onSaved={(category) => {
          toast.success(saved);
          onSaved(category);
        }}
      />
    </aside>
  );
};
