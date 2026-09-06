import type { Metadata } from "next";
import { Nunito, Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const nunito = Nunito({ subsets: ["latin"], variable: "--font-nunito" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "Farmavale Central",
  description: "Central corporativa de atendimento",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${outfit.variable} ${nunito.variable} ${jakarta.variable}`}>{children}</body>
    </html>
  );
}
