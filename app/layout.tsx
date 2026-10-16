import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "AWOS 3D Dashboard",
  description: "Aerodrome Weather Intelligence",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        {/* Load CSS Cesium langsung dari CDN */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/cesium@latest/Build/Cesium/Widgets/widgets.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
