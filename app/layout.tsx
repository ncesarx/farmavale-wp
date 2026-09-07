import type { Metadata } from "next";
import "@fontsource-variable/outfit";
import "@fontsource-variable/nunito";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";

export const metadata: Metadata = {
  title: "Farmavale Central",
  description: "Central corporativa de atendimento",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
