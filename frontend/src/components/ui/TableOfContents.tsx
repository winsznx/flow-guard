import { useEffect, useState } from 'react';
import { Menu } from './Menu';
import { cx } from './cx';

export type TableOfContentsProps = { items: { id: string; label: string }[] };

const NAV_LABEL = 'On this page';
const READING_LINE = '0px 0px -70% 0px';

function goTo(id: string) {
  const section = document.getElementById(id);
  if (!section) return;
  window.history.replaceState(window.history.state, '', `#${id}`);
  section.scrollIntoView();
}

export function TableOfContents({ items }: TableOfContentsProps) {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const ids = items.map((item) => item.id).join(' ');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const sections = ids
      .split(' ')
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => node !== null);
    if (sections.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
        setCurrentId(top.target.id);
      },
      { rootMargin: READING_LINE },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [ids]);

  const activeId = currentId ?? items[0]?.id ?? null;

  return (
    <>
      <div className="lg:hidden">
        <Menu
          label={NAV_LABEL}
          trigger="button"
          items={items.map((item) => ({ label: item.label, onSelect: () => goTo(item.id) }))}
        />
      </div>
      <nav aria-label={NAV_LABEL} className="hidden lg:sticky lg:top-24 lg:block">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={active ? 'location' : undefined}
                  className={cx(
                    'block border-l-2 py-1.5 pl-3 text-label transition-colors duration-(--duration-fast) ease-standard',
                    active ? 'border-brand text-ink' : 'border-transparent text-ink-secondary hover:text-ink',
                  )}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
