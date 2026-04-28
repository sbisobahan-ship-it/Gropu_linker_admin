import "./globals.css";

export const metadata = {
  title: "Group Linker Admin Panel",
  description: "Modern admin panel for Group Linker API",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
