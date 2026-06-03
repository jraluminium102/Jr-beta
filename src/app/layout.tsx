import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JR ERP — ระบบบัญชี",
  description: "JR Aluminium and Glass · Billing & AR (P1)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
