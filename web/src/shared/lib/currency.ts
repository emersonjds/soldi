import { createContext, use } from "react";

import type { Schemas } from "@/shared/api/client";

export type Currency = Schemas["Currency"];

/** The currency every amount below it is shown in; reais until something says otherwise. */
export const CurrencyContext = createContext<Currency>("BRL");

export const useCurrency = () => use(CurrencyContext);
