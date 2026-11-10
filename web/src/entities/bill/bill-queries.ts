import {
  type QueryClient,
  type QueryFilters,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { api, dataOrThrow, okOrThrow, type Schemas } from "@/shared/api/client";
import { todayISO } from "@/shared/lib/date";

export type Bill = Schemas["Bill"];
export type BillOfMonth = Schemas["BillOfMonth"];
export type BillPrefill = Schemas["CreateBill"];

export const billsQuery = (includeInactive = false) =>
  queryOptions({
    queryKey: ["bills", includeInactive],
    queryFn: async () =>
      dataOrThrow(await api.GET("/api/bills", { params: { query: { include_inactive: includeInactive } } })),
  });

export const useBills = ({ includeInactive = false } = {}) => useQuery(billsQuery(includeInactive));

// A bill changes the projection of every month it falls in.
const refresh = (client: QueryClient) =>
  Promise.all([
    client.invalidateQueries({ queryKey: ["bills"] }),
    client.invalidateQueries({ queryKey: ["month"] }),
    client.invalidateQueries({ queryKey: ["transactions"] }),
  ]);

export const useCreateBill = () => {
  const client = useQueryClient();
  return useMutation({
    /** `transactionId`: a standalone Saída entry that becomes this bill's payment. */
    mutationFn: async ({ transactionId, ...body }: Schemas["CreateBill"] & { transactionId?: string }) =>
      dataOrThrow(await api.POST("/api/bills", { params: { query: { transaction_id: transactionId } }, body })),
    // The linked entry becomes a bill payment; reports and cofrinhos read it.
    onSettled: (_bill, _error, { transactionId }) =>
      Promise.all([
        refresh(client),
        ...(transactionId ? ["report", "cofrinhos"] : []).map((key) => client.invalidateQueries({ queryKey: [key] })),
      ]),
  });
};

export const useUpdateBill = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: Schemas["UpdateBill"] & { id: string }) =>
      dataOrThrow(await api.PATCH("/api/bills/{id}", { params: { path: { id } }, body })),
    onSettled: () => refresh(client),
  });
};

export const useArchiveBill = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => okOrThrow(await api.DELETE("/api/bills/{id}", { params: { path: { id } } })),
    onSettled: () => refresh(client),
  });
};

type Payment = { billId: string; month: string };

/** Rewrites one row in every cached month that shows it (a carried row sits in the next month too) and hands back how to undo it. */
const patchRow = async (
  client: QueryClient,
  { billId, month }: Payment,
  patch: (row: BillOfMonth) => Partial<BillOfMonth>,
) => {
  const filters: QueryFilters = { queryKey: ["month"], predicate: ({ queryKey }) => queryKey[1] !== "forecast" };
  await client.cancelQueries(filters);
  const previous = client.getQueriesData<Schemas["MonthView"]>(filters);
  client.setQueriesData<Schemas["MonthView"]>(
    filters,
    (view) =>
      view && {
        ...view,
        bills_of_month: view.bills_of_month.map((row) =>
          row.bill_id === billId && row.due_date.startsWith(month) ? { ...row, ...patch(row) } : row,
        ),
      },
  );
  return () => {
    for (const [queryKey, view] of previous) client.setQueryData(queryKey, view);
  };
};

export const usePayBill = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ billId, month, ...body }: Payment & Schemas["PayBill"]) =>
      dataOrThrow(await api.POST("/api/bills/{id}/pay", { params: { path: { id: billId }, query: { month } }, body })),
    onMutate: (payment) =>
      patchRow(client, payment, (row) => ({ paid: true, overdue: false, amount: payment.amount ?? row.amount })),
    onError: (_error, _payment, rollback) => rollback?.(),
    onSettled: () => refresh(client),
  });
};

export const useUnpayBill = () => {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ billId, month }: Payment) =>
      okOrThrow(await api.DELETE("/api/bills/{id}/pay", { params: { path: { id: billId }, query: { month } } })),
    onMutate: (payment) =>
      patchRow(client, payment, (row) => ({ paid: false, transaction_id: null, overdue: row.due_date < todayISO() })),
    onError: (_error, _payment, rollback) => rollback?.(),
    onSettled: () => refresh(client),
  });
};

/** Today when paying the current month, the due date otherwise: the API wants a date inside `month`. */
export const payDateFor = (month: string, dueDate: string) => {
  const today = todayISO();
  return today.startsWith(month) ? today : dueDate;
};
