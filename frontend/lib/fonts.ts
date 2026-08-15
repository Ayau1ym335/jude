import localFont from "next/font/local";
import { Roboto } from "next/font/google";

export const michroma = localFont({
  src: "../public/fonts/michroma/Michroma-Regular.ttf",
  variable: "--font-michroma",
  display: "swap",
});

export const robotoMono = localFont({
  src: [
    {
      path: "../public/fonts/roboto-mono/static/RobotoMono-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/roboto-mono/static/RobotoMono-Medium.ttf",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-roboto-mono",
  display: "swap",
});

export const roboto = Roboto({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});
