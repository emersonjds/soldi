import type { ReactNode } from "react";

import { AppShell } from "@/widgets/app-shell/app-shell";

const ShellLayout = ({ children }: Readonly<{ children: ReactNode }>) => <AppShell>{children}</AppShell>;

export default ShellLayout;
