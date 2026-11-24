import type { Schemas } from "@/shared/api/client";

/** The Diário previsto per day the projection counts (D49); `null` when never set or off. */
export const activeEstimate = (settings: Schemas["Settings"]) =>
  settings.daily_estimate_on ? settings.daily_estimate : null;

/** Whether a figure counts the estimate (X3): a month that ends after today, or a forecast that runs past today. */
export const includesEstimate = (settings: Schemas["Settings"], figure: Schemas["MonthView"] | Schemas["Forecast"]) => {
  if (activeEstimate(settings) === null) return false;
  if ("today" in figure) return figure.days.some((day) => day.date > figure.today);
  return figure.days.at(-1)?.is_future === true;
};
