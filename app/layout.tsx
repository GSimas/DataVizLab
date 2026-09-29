import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "./globals.css";
import { prefsBootstrap } from "../lib/prefs";

export const viewport: Viewport = { themeColor: "#07110f", colorScheme: "dark light" };

export const metadata: Metadata = {
  metadataBase: new URL("https://datavizlab.site"),
  title: {
    default: "DataVizLab — Do dado à forma certa",
    template: "%s · DataVizLab",
  },
  description: "Catálogo bilíngue, recomendador e estúdio local para explorar, escolher e criar visualizações de dados sem enviar arquivos para servidores.",
  keywords: ["visualização de dados", "data visualization", "gráficos", "CSV", "Excel", "privacidade", "data storytelling", "dataviz"],
  authors: [{ name: "Scientata", url: "https://scientata.com" }],
  creator: "Scientata",
  applicationName: "DataVizLab",
  alternates: { canonical: "/", languages: { "pt-BR": "/", en: "/" } },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    alternateLocale: ["en_US"],
    title: "DataVizLab — Do dado à forma certa",
    description: "Explore métodos, encontre a visualização adequada e construa com seus dados — localmente.",
    siteName: "DataVizLab",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "DataVizLab — Do dado à forma certa" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "DataVizLab — Do dado à forma certa",
    description: "Catálogo, recomendador e estúdio local de visualização de dados.",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" data-theme="dark" data-contrast="normal" data-motion="full" data-font="md" suppressHydrationWarning>
      <head>
        {/* Applies saved theme, contrast, motion and text size before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: prefsBootstrap }} />
      </head>
      <body className="antialiased">
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "DataVizLab",
              applicationCategory: "EducationalApplication",
              operatingSystem: "Web",
              inLanguage: ["pt-BR", "en"],
              description: "Catálogo, recomendador e estúdio local de visualização de dados.",
              author: { "@type": "Organization", name: "Scientata", url: "https://scientata.com" },
              offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
              featureList: ["Catálogo de visualizações", "Recomendador determinístico", "Importação local de CSV e Excel", "Exportação PNG, SVG e ZIP", "Interface bilíngue"],
            }),
          }}
        />
      </body>
    </html>
  );
}
