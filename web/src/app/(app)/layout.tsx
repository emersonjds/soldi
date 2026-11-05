import type { ReactNode } from "react";

import { SessionGate } from "@/entities/user/session";

const AppLayout = ({ children }: Readonly<{ children: ReactNode }>) => <SessionGate>{children}</SessionGate>;

export default AppLayout;
