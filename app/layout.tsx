import type { Metadata } from "next";
import { Inter, Pacifico } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./components/providers/auth-provider";

const inter = Inter({ subsets: ["latin"] });

const pacifico = Pacifico({ 
  subsets: ["latin"],
  weight: "400",
  variable: '--font-logo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Premium IEP Scheduler",
  description: "Collaborative scheduling platform for special education providers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={pacifico.variable}>
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
