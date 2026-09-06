import type { Metadata } from "next";
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
