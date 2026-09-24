import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="mono text-xs text-secondary">404</p>
      <h1 className="text-xl font-semibold tracking-tight">找不到這個頁面</h1>
      <p className="text-sm text-secondary max-w-[40ch]">網址可能打錯了，或這堂課的連結已經失效。你的課堂都在首頁。</p>
      <Link href="/" className="press mt-2 inline-flex h-10 items-center rounded-control bg-brand px-4 text-sm font-medium text-white">回到首頁</Link>
    </main>
  );
}
