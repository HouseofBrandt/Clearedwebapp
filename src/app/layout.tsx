import type { Metadata } from "next"
import { Inter, JetBrains_Mono, Instrument_Serif, Cormorant_Garamond, DM_Sans } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-inter",
  display: "swap",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
})

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
})

// Editorial serif for display/greeting and Pippen's pull-quote body.
// Intentionally limited to 300/400/500 — the dashboard voice is light.
const cormorantGaramond = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
})

// Body/UI sans for the new dashboard. DM Sans has a clean editorial feel at
// weight 300 which is what the spec asks for.
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-sans",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Cleared - Tax Resolution Platform",
  description: "AI-Powered Tax Resolution Platform for Licensed Practitioners",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} ${cormorantGaramond.variable} ${dmSans.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
