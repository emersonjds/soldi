import * as React from "react";

const SM_BREAKPOINT = 640;

export function useIsSm() {
  const [isSm, setIsSm] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${SM_BREAKPOINT}px)`);
    const onChange = () => {
      setIsSm(window.innerWidth >= SM_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsSm(window.innerWidth >= SM_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isSm;
}
