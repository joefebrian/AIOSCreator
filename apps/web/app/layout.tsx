import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Shell } from "@/components/Shell";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "AIOS Creator",
  description: "Local-first creator OS. Characters, stills, motion, and affiliate UGC on your GPU.",
  icons: {
    icon: "/brand/aios-mark.jpg",
    apple: "/brand/aios-mark.jpg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#F3F4F8]">
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
