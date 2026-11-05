import type { ReactNode } from "react";

import { HeroFrame } from "@/shared/ui/hero-frame";

const AuthLayout = ({ children }: Readonly<{ children: ReactNode }>) => <HeroFrame>{children}</HeroFrame>;

export default AuthLayout;
