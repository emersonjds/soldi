import { Inter, Nunito } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const nunito = Nunito({
  weight: "700",
  subsets: ["latin"],
  variable: "--font-nunito",
});

export const fontVars = `${inter.variable} ${nunito.variable}`;
