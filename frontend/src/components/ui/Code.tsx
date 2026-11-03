export type CodeProps = { children: string; block?: boolean };

export function Code({ children, block = false }: CodeProps) {
  if (block) {
    return (
      <pre className="overflow-x-auto rounded-control bg-sunken p-3 font-mono text-mono text-ink">
        <code>{children}</code>
      </pre>
    );
  }
  return <code className="rounded-inline bg-sunken px-1.5 font-mono text-mono text-ink break-all">{children}</code>;
}
