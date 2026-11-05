import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const fontRegistry = {
  inter: {
    label: "Inter",
    font: inter,
  },
} as const;

export type FontKey = keyof typeof fontRegistry;

export const fontKeys = Object.keys(fontRegistry) as FontKey[];

export const fontVars = Object.values(fontRegistry)
  .map(({ font }) => font.variable)
  .join(" ");

export const fontOptions = fontKeys.map((key) => ({
  key,
  label: fontRegistry[key].label,
}));
