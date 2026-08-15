import type { Metadata } from "next";
import { michroma, roboto, robotoMono } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "JUDE — платформа ортезирования",
  description: "Управление пациентами, сканами и проектами AFO",
  icons: {
    icon: "/jude-logo.png",
    apple: "/jude-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${michroma.variable} ${roboto.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
