type WorkspacePageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
};

export function WorkspacePageHeader({
  eyebrow,
  title,
  description,
  actions,
}: WorkspacePageHeaderProps) {
  return (
    <section className="surface-card px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700">
            {eyebrow}
          </p>
          <h2 className="font-display mt-3 text-[1.75rem] tracking-tight text-slate-950 sm:text-[2rem] lg:text-[2.65rem]">
            {title}
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
            {description}
          </p>
        </div>

        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
