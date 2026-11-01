import "./globals.css";
export const metadata = {
  title: "VYŪHA 2026 · Badminton live",
  description:
    "Every rally. Every court. Follow live badminton scores, fixtures, standings and knockouts at DJSCE Trinity.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "VYŪHA", statusBarStyle: "default" },
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#123d2b",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
