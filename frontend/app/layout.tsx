import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "../components/providers";

export const metadata: Metadata = {
  title: "Blockchain IAM",
  description: "Identity, access, asset custody and audit evidence console",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className="dark"><body><Providers>{children}</Providers></body></html>;
}
