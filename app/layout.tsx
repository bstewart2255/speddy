import type { Metadata } from "next";
import { Inter, Pacifico } from "next/font/google";
import Script from 'next/script';
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
        <Script
          id="crisp-widget"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              window.$crisp=[];
              window.CRISP_WEBSITE_ID="23e988ce-802b-4c86-8738-eb8a1d3374b0";
              window.CRISP_HIDE_ON_LOAD = true;
              (function(){
                var d=document;
                var s=d.createElement("script");
                s.src="https://client.crisp.chat/l.js";
                s.async=1;
                d.getElementsByTagName("head")[0].appendChild(s);
              })();

              // Ensure it's hidden after load
              setTimeout(() => {
                if (window.$crisp) {
                  window.$crisp.push(['do', 'chat:hide']);
                }
              }, 2000);
            `,
          }}
        />
      </body>
    </html>
  );
}