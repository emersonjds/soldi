import { type QueryClient, queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { monthQuery } from "@/entities/month/month-query";
import { api, dataOrThrow, okOrThrow, type Schemas } from "@/shared/api/client";
import { todayISO } from "@/shared/lib/date";

export type Bill = Schemas["Bill"];
export type BillOfMonth = Schemas["BillOfMonth"];

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
    onSettled: () => refresh(client),
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

/** Rewrites one row of the cached month and hands back how to undo it. */
const patchRow = async (
  client: QueryClient,
  { billId, month }: Payment,
  patch: (row: BillOfMonth) => Partial<BillOfMonth>,
) => {
  const { queryKey } = monthQuery(month);
  await client.cancelQueries({ queryKey });
  const previous = client.getQueryData(queryKey);
  client.setQueryData(
    queryKey,
    (view) =>
      view && {
        ...view,
        bills_of_month: view.bills_of_month.map((row) => (row.bill_id === billId ? { ...row, ...patch(row) } : row)),
      },
  );
  return () => client.setQueryData(queryKey, previous);
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
