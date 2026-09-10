export function Footer() {
  return (
    <footer className="mt-auto border-t border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto mt-8 flex w-full max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-8 text-sm text-neutral-500 sm:px-6 sm:py-10 dark:text-neutral-400">
        <span>by martinwong</span>
        <span aria-hidden className="text-neutral-300 dark:text-neutral-700">·</span>
        <span>
          data from{" "}
          <a
            href="https://api.sfucourses.com"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
          >
            api.sfucourses.com
          </a>
        </span>
      </div>
    </footer>
  );
}
