"use client";

import type { ReactNode } from "react";

import { CurrencyContext } from "@/shared/lib/currency";

import { useSettings } from "./settings-query";

/** Shows every amount inside it in the currency the user chose; reais while the settings load. */
export const SettingsCurrency = ({ children }: { children: ReactNode }) => (
  <CurrencyContext value={useSettings().data?.currency ?? "BRL"}>{children}</CurrencyContext>
);
