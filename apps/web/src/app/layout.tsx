export const metadata = {
  title: '3D Design Studio',
  description: '3D painting/viewer',
}

import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
