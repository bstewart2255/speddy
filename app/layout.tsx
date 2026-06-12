import type { Metadata } from "next";
import { Inter, Pacifico, DM_Sans } from "next/font/google";
import Script from 'next/script';
import "./globals.css";
import { AuthProvider } from "./components/providers/auth-provider";

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter',
  display: 'swap',
});

const pacifico = Pacifico({
  subsets: ["latin"],
  weight: "400",
  variable: '--font-logo',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Speddy",
  description: "Super helpful SpEd platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${pacifico.variable} ${dmSans.variable}`}>
      <body className={`${inter.className || 'font-sans'}`}>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Script
          id="helpscout-beacon"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              !function(e,t,n){function a(){var e=t.getElementsByTagName("script")[0],n=t.createElement("script");n.type="text/javascript",n.async=!0,n.src="https://beacon-v2.helpscout.net",e.parentNode.insertBefore(n,e)}if(e.Beacon=n=function(t,n,a){e.Beacon.readyQueue.push({method:t,options:n,data:a})},n.readyQueue=[],"complete"===t.readyState)return a();e.attachEvent?e.attachEvent("onload",a):e.addEventListener("load",a,!1)}(window,document,window.Beacon||function(){});
              window.Beacon('init', 'acb6362b-53aa-4ebc-acba-772d9bd6fe4c');
            `,
          }}
        />
      </body>
    </html>
  );
}