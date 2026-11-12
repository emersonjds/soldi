import * as React from "react";

const XL_BREAKPOINT = 1280;

export function useIsXl() {
  const [isXl, setIsXl] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${XL_BREAKPOINT}px)`);
    const onChange = () => {
      setIsXl(window.innerWidth >= XL_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsXl(window.innerWidth >= XL_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isXl;
}
