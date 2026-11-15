"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { hasProblem, hasStatus, problemMessage, type Schemas } from "@/shared/api/client";
import { positiveAmount } from "@/shared/lib/money";
import { plain } from "@/shared/lib/text";
import { AmountInput } from "@/shared/ui/amount-input";
import { BrandButton } from "@/shared/ui/brand-button";
import { CategoryIcon, categoryBg } from "@/shared/ui/category-icon";
import { DateField } from "@/shared/ui/date-field";
import { PageError, PageLoading } from "@/shared/ui/page-state";
import { ResponsiveSheet, ResponsiveSheetFooter } from "@/shared/ui/responsive-sheet";

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
  `Todas as 24 cores estão em uso. ${editing ? "Mantenha" : "Crie"} como subcategoria ou exclua uma categoria.`;

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

/** The kind words Lançar uses. */
export const KIND_NAMES: Record<Kind, string> = { daily: "Diário", bill: "Conta", income: "Entrada" };

const OUTFLOW_KINDS: Kind[] = ["daily", "bill"];

const FLOW_KINDS: Kind[] = [...OUTFLOW_KINDS, "income"];

/** A "+" fixes the side: Diário and Conta under an outflow group, nothing under an income one. */
const kindChoicesUnder = (group?: Category): Kind[] => {
  if (!group) return FLOW_KINDS;
  return group.kind === "income" ? [] : OUTFLOW_KINDS;
};

const placeholderOf = (cofrinho: boolean, sub: boolean) => {
  if (cofrinho) return "Ex.: Viagem";
  return sub ? "Ex.: Farmácia" : "Ex.: Educação";
};

/** Any failure but a taken name, which Nome itself shows. */
const problemOf = (error: Error | null, editing: boolean) => {
  if (!error || hasStatus(error, 409)) return undefined;
  if (hasProblem(error, "color-taken")) return "Essa cor já é de outra categoria.";
  if (hasProblem(error, "palette-full")) return allTaken(editing);
  return `Não foi possível ${editing ? "salvar" : "criar"} a categoria. Tente de novo.`;
};

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
  /** The group a "+" opened the form under: shown read-only. */
  parentId?: string;
  onSaved: (category: Category) => void;
  onArchive: (category: Category) => void;
  /** Called with the new kind once the API moved or created the category there; given, creating offers `Tipo`. */
  onKindChange?: (kind: Kind) => void;
  /** Told the parent the form links to, which makes it a cofrinho under Economia. */
  onParentChange?: (parentId: string) => void;
  /** Creating: the name and goal the form starts with. */
  initial?: { name: string; target: string };
  /** Editing a cofrinho: its stored note, which `Category` does not carry. */
  note?: string | null;
};

const CategoryForm = ({
  kind,
  category,
  parentId: presetParent,
  onSaved,
  onArchive,
  onKindChange,
  onParentChange,
  initial,
  note: storedNote,
}: FormProps) => {
  const [name, setName] = useState(category?.name ?? initial?.name ?? "");
  const [ownKind, setOwnKind] = useState(category?.kind);
  const [asking, setAsking] = useState(false);
  const [nextKind, setNextKind] = useState<Kind>("bill");
  const [icon, setIcon] = useState(category?.icon);
  const [movedTo, setParentId] = useState(category?.parent_id ?? "");
  const [sub, setSub] = useState(Boolean(presetParent));
  const [picked, setPicked] = useState(presetParent ?? "");
  const [flow, setFlow] = useState(kind);
  const [submitted, setSubmitted] = useState(false);
  const [parentSearch, setParentSearch] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const parentsRef = useRef<HTMLDivElement>(null);
  useEffect(() => nameRef.current?.focus(), []);
  // Edited from another kind's list (D26), a category keeps its own kind.
  const formKind = ownKind ?? flow;
  const list = useQuery(categoriesQuery).data ?? [];
  const parents = list.filter((each) => !each.parent_id && each.id !== category?.id && sameSide(each, formKind));
  const offered = parents.some((each) => each.id === picked);
  const linked = sub && offered ? picked : "";
  const parentId = category ? movedTo : linked;
  useEffect(() => onParentChange?.(parentId), [onParentChange, parentId]);
  const shownParents = parents.filter((each) => plain(each.name).includes(plain(parentSearch.trim())));
  const system = useQuery(systemCategoriesQuery).data ?? list;
  const holders = (category ? kindsOf({ ...category, kind: formKind }, system) : [formKind]).flatMap((each) =>
    ofKind(system, each),
  );
  const [color, setColor] = useState(category?.color);
  const [target, setTarget] = useState(category?.target ?? initial?.target ?? "");
  const [deadline, setDeadline] = useState(category?.deadline ?? "");
  const [note, setNote] = useState(storedNote ?? "");
  // Code points, like the server's `chars().count()`: an emoji counts once.
  const noteLength = [...note].length;
  const noteTooLong = noteLength > 140;
  const parent = list.find((each) => each.id === parentId);
  const lockedParent = category ? undefined : list.find((each) => each.id === presetParent);
  const cofrinho = Boolean(parent?.is_savings);
  const chosenIcon = icon ?? parent?.icon ?? "circle-dashed";
  const free = freeColor(holders, category?.id);
  const ownColor = color && !holderOf(holders, color, category?.id) ? color : free;
  const chosenColor = parentId ? parent?.color : ownColor;
  const pickingParent = sub && !category;
  const needsColor = !parentId && !pickingParent;
  const full = needsColor && !free;
  const hasChildren = Boolean(category) && list.some((each) => each.parent_id === category?.id);
  // Economia cannot get a parent, and a cofrinho made from Cofrinhos stays under it.
  const fixedParent = category?.is_savings || lockedParent?.is_savings;
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
  const sentName = (category ? update.variables?.name : create.variables?.name) ?? trimmed;
  const taken = hasStatus(mutation.error, 409) ? `Já existe "${sentName}" em ${KIND_NAMES[formKind]}.` : undefined;
  const nameError = submitted && !trimmed ? "Informe o nome." : taken;
  const parentError = submitted && !category && sub && !parentId ? "Escolha o grupo." : undefined;
  const swatches = [
    ...COLOR_NAMES.filter(([token]) => token === chosenColor),
    ...COLOR_NAMES.filter(([token]) => token !== chosenColor && !holderOf(holders, token, category?.id)),
  ];
  const kindChoices = kindChoicesUnder(lockedParent);
  const creatingFlow = !category && onKindChange && !fixedParent && kindChoices.length > 0;
  const problem = problemOf(mutation.error, Boolean(category));
  const placeholder = placeholderOf(cofrinho, Boolean(parentId) || pickingParent);
  const action = category ? "Salvar" : "Criar";
  const busy = category ? "Salvando…" : "Criando…";
  const focusName = (error: Error) => {
    if (hasStatus(error, 409)) nameRef.current?.focus();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    // React bubbles the submit through the portal to the Lançar form around the picker.
    event.stopPropagation();
    setSubmitted(true);
    if (!trimmed) return nameRef.current?.focus();
    if (!category && sub && !parentId) return parentsRef.current?.querySelector("input")?.focus();
    if (cofrinho && noteTooLong) return;
    const noteChange = note === (storedNote ?? "") ? {} : { note: note.trim() || null };
    // Outside Economia the API refuses a goal, so only a cofrinho sends one.
    const goal = cofrinho ? { target: positiveAmount(target), deadline: deadline || null, ...noteChange } : {};
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
        { onSuccess: onSaved, onError: focusName },
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
        onError: focusName,
      },
    );
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      {!category && !presetParent && (
        <ToggleGroup
          type="single"
          spacing={0}
          value={sub ? "sub" : "top"}
          onValueChange={(value) => value && setSub(value === "sub")}
          aria-label="Grupo ou subcategoria"
          className="grid w-full grid-cols-2 rounded-2xl bg-muted p-1"
        >
          <ToggleGroupItem value="top" className={segment}>
            Grupo
          </ToggleGroupItem>
          <ToggleGroupItem value="sub" className={segment}>
            Subcategoria
          </ToggleGroupItem>
        </ToggleGroup>
      )}
      <Field className="gap-1.5" data-invalid={Boolean(nameError)}>
        <FieldLabel htmlFor="category-name">Nome</FieldLabel>
        <Input
          ref={nameRef}
          id="category-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={placeholder}
          maxLength={40}
          autoComplete="off"
          className={field}
          aria-invalid={Boolean(nameError)}
        />
        {nameError && <FieldError>{nameError}</FieldError>}
      </Field>
      {creatingFlow && (
        <div className="flex flex-col gap-1.5">
          <FieldTitle id="category-flow">Tipo</FieldTitle>
          <ToggleGroup
            type="single"
            spacing={0}
            value={flow}
            onValueChange={(value: Kind | "") => value && setFlow(value)}
            aria-labelledby="category-flow"
            className={cn("grid w-full gap-2", kindChoices.length === 3 ? "grid-cols-3" : "grid-cols-2")}
          >
            {kindChoices.map((value) => (
              <ToggleGroupItem key={value} value={value} className={cn(kindChip, "bg-muted")}>
                {KIND_NAMES[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      {kindChangeable && (
        <div className="flex flex-col gap-1.5">
          <FieldTitle id="category-kind">Tipo</FieldTitle>
          <ToggleGroup
            type="single"
            spacing={0}
            value={formKind}
            onValueChange={askKind}
            aria-labelledby="category-kind"
            className="grid w-full grid-cols-2 rounded-2xl bg-muted p-1"
          >
            {OUTFLOW_KINDS.map((value) => (
              <ToggleGroupItem key={value} value={value} className={kindChip}>
                {KIND_NAMES[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <AlertDialog open={asking} onOpenChange={setAsking}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{`Mudar para ${KIND_NAMES[nextKind]}?`}</AlertDialogTitle>
                <AlertDialogDescription>
                  {`Todos os lançamentos de ${category.name} passam a ser ${KIND_NAMES[nextKind]}. O saldo não muda.`}
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
      {lockedParent && !fixedParent && (
        <p className="flex min-h-11 items-center gap-3 text-base">
          <CategoryIcon icon={lockedParent.icon} color={lockedParent.color} className="size-8" />
          {`Dentro de ${lockedParent.name}`}
        </p>
      )}
      {category && !hasChildren && !fixedParent && (
        <Field className="gap-1.5">
          <FieldLabel htmlFor="category-parent">Dentro de</FieldLabel>
          <NativeSelect
            id="category-parent"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            className="w-full [&>select]:h-12 [&>select]:rounded-xl [&>select]:pl-3 [&>select]:text-base"
          >
            <NativeSelectOption value="">Nenhum (é um grupo)</NativeSelectOption>
            {parents.map((each) => (
              <NativeSelectOption key={each.id} value={each.id}>
                {each.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
      {!category && sub && !presetParent && (
        <div className="flex flex-col gap-2">
          <span id="category-parents" className="font-semibold text-sm">
            Dentro de
          </span>
          {parents.length > 8 && (
            <Input
              type="search"
              aria-label="Buscar categoria"
              placeholder="Buscar categoria..."
              value={parentSearch}
              onChange={(event) => setParentSearch(event.target.value)}
              className={field}
            />
          )}
          <div ref={parentsRef} role="radiogroup" aria-labelledby="category-parents" className="flex flex-col gap-1">
            {shownParents.map((each) => (
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
            {parents.length === 0 && <p className="text-muted-foreground text-sm">Nenhum grupo deste tipo.</p>}
          </div>
          {parentError && (
            <p role="alert" className="text-destructive text-sm">
              {parentError}
            </p>
          )}
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
      {cofrinho && (
        <Field className="gap-1.5" data-invalid={noteTooLong}>
          <FieldLabel htmlFor="category-note">Descrição (opcional)</FieldLabel>
          <Textarea
            id="category-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ex.: Início planejado após consolidar a Reserva de Emergência."
            className="text-base md:text-base"
            aria-invalid={noteTooLong}
            aria-describedby="category-note-count"
          />
          <span
            id="category-note-count"
            className={cn("self-end text-sm", noteTooLong ? "text-destructive" : "text-muted-foreground")}
          >
            {noteLength}/140
          </span>
          {noteTooLong && <FieldError>Use até 140 caracteres.</FieldError>}
        </Field>
      )}
      <div className="flex items-center gap-3">
        <CategoryIcon icon={chosenIcon} color={chosenColor ?? ""} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-semibold text-base">{needsColor ? "Ícone e cor" : "Ícone"}</span>
          {parent && <span className="text-muted-foreground text-sm">{`Usa a cor de ${parent.name}`}</span>}
        </div>
      </div>
      {full && <p className="text-muted-foreground text-sm">{allTaken(Boolean(category))}</p>}
      <IconPicker value={chosenIcon} color={chosenColor ?? ""} onChange={setIcon} />
      {needsColor && !full && (
        <fieldset aria-labelledby="category-color" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <span id="category-color" className="font-semibold text-sm">
              Cor
            </span>
            <span className="font-semibold text-primary text-sm">
              {COLOR_NAMES.find(([token]) => token === chosenColor)?.[1]}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {swatches.map(([token, label]) => (
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
      )}
      {problem && (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
      <ResponsiveSheetFooter>
        <BrandButton type="submit" disabled={mutation.isPending || full}>
          {mutation.isPending ? busy : action}
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
      </ResponsiveSheetFooter>
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
const useHeading = (category: Category | undefined, linked: string | null | undefined, preset?: string) => {
  const list = useQuery(categoriesQuery).data;
  const cofrinho = Boolean(list?.find((each) => each.id === linked)?.is_savings);
  const done = category ? "salv" : "criad";
  if (cofrinho) return { title: `${category ? "Editar" : "Novo"} cofrinho`, saved: `Cofrinho ${done}o` };
  if (category) return { title: "Editar categoria", saved: "Categoria salva" };
  return { title: preset ? "Nova subcategoria" : "Nova categoria", saved: "Categoria criada" };
};

const formKey = ({ category, parentId }: Pick<FormProps, "category" | "parentId">) =>
  category?.id ?? `new-${parentId ?? ""}`;

/** The form once the categories arrived; a failure offers to retry. */
const LoadedForm = (props: FormProps) => {
  const categories = useQuery(categoriesQuery);
  if (categories.data) return <CategoryForm {...props} />;
  if (categories.isError)
    return <PageError message="Não foi possível carregar as categorias." onRetry={() => categories.refetch()} />;
  return <PageLoading />;
};

/**
 * `Nova categoria`, `Nova subcategoria` (a group's "+") or `Editar categoria`: name, kind, group, icon and a free palette color.
 * Editing a Diário or Conta category offers `Tipo`, which moves it and its entries after a confirmation.
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
  const [linked, setLinked] = useState(form.category?.parent_id ?? form.parentId);
  const { title, saved } = useHeading(form.category, linked, form.parentId);
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Nome, tipo, ícone e cor."
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <LoadedForm
        key={formKey(form)}
        {...form}
        onParentChange={setLinked}
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
