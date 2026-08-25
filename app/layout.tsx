import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://datavizlab.site"),
  title: {
    default: "DataVizLab — Do dado à forma certa",
    template: "%s · DataVizLab",
  },
  description: "Atlas bilíngue, recomendador e estúdio local para explorar, escolher e criar visualizações de dados sem enviar arquivos para servidores.",
  keywords: ["visualização de dados", "data visualization", "gráficos", "CSV", "Excel", "privacidade", "data storytelling", "dataviz"],
  authors: [{ name: "Gustavo Simas", url: "https://gustavosimas.com/" }],
  creator: "Gustavo Simas",
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
    description: "Atlas, recomendador e estúdio local de visualização de dados.",
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
    <html lang="pt-BR" suppressHydrationWarning>
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
              description: "Atlas, recomendador e estúdio local de visualização de dados.",
              author: { "@type": "Person", name: "Gustavo Simas", url: "https://gustavosimas.com/" },
              offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
              featureList: ["Catálogo de visualizações", "Recomendador determinístico", "Importação local de CSV e Excel", "Exportação PNG, SVG e ZIP", "Interface bilíngue"],
            }),
          }}
        />
      </body>
    </html>
  );
}
