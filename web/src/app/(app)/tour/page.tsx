import { Suspense } from "react";

import { WelcomeTour } from "@/features/welcome-tour/welcome-tour";

const TourPage = () => (
  <Suspense>
    <WelcomeTour />
  </Suspense>
);

export default TourPage;
