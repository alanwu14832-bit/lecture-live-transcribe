import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";
import { PrefsProvider } from "@/components/PrefsProvider";

export const metadata: Metadata = {
  title: "CaseNote",
  description: "專心聽課，讓逐字稿跟上你。免費的中英混合課堂即時轉錄工作台，資料只存在你的裝置。",
  applicationName: "CaseNote",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#111318" },
  ],
};

// 在 React 掛載前先套用主題，避免深色模式使用者看到白色閃一下
const themeInit = `(function(){try{var p=JSON.parse(localStorage.getItem('casenote:prefs')||'{}');var t=p.theme||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.fontSize=String(p.fontSize||2);}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* App Router 的 root layout 套用到所有頁面，這條 pages router 的警告不適用；不用 next/font 是為了讓離線建置不需要連 Google */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Noto+Sans+TC:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full bg-canvas text-primary">
        <PrefsProvider>{children}</PrefsProvider>
      </body>
    </html>
  );
}
