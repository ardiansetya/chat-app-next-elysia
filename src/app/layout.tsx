import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/toast";
import "./globals.css";

const fontSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const fontMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Chat App",
  description: "Chat real-time berbasis room",
};

// Ikuti tema sistem tanpa library tambahan; jalan sebelum paint supaya tidak berkedip.
const themeScript = `(function(){var m=matchMedia("(prefers-color-scheme: dark)");function a(){document.documentElement.classList.toggle("dark",m.matches)}a();m.addEventListener("change",a)})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${fontSans.variable} ${fontMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex h-full flex-col bg-background font-sans text-foreground">
        <Toaster>{children}</Toaster>
      </body>
    </html>
  );
}
