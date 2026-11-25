export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-4">
      {children}
      <p className="text-sm text-muted-foreground">
        Dibuat oleh{" "}
        <a
          href="https://ardiansetya.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground underline underline-offset-4"
        >
          Ardian Setya Pradana
        </a>
      </p>
    </main>
  );
}
