import Image from "next/image";

/**
 * Styled after sfucourses, reused with the owner's permission (MIT — see
 * LICENSE.sfucourses): the dark band, the code-snippet flourish cropped into
 * the bottom-right corner, and the green link colour are theirs. The site
 * takes its course data from their API, so looking like a relative of it is
 * the honest signal.
 *
 * The band is dark in both themes on purpose — it's the page's floor, and a
 * light footer under a light page needs a border to exist at all.
 */
export function Footer() {
  return (
    <footer className="relative mt-auto overflow-hidden bg-[#191a1a]">
      {/* Decorative, and it bleeds off two edges: no alt text, and it must
          never widen the page or sit above the links. */}
      <Image
        src="/code-snippet.svg"
        alt=""
        aria-hidden
        width={274}
        height={118}
        className="pointer-events-none absolute right-0 bottom-0 w-[200px] select-none opacity-60 sm:w-[274px]"
      />

      <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-10 text-sm text-neutral-300 sm:px-6 sm:py-12">
        <p>
          by{" "}
          <FooterLink href="https://github.com/Mighty303">martinwong</FooterLink>
        </p>
        <p>
          data from{" "}
          <FooterLink href="https://api.sfucourses.com">api.sfucourses.com</FooterLink>
          , design borrowed from{" "}
          <FooterLink href="https://sfucourses.com">sfucourses</FooterLink>
        </p>
        <a
          href="https://github.com/Mighty303/meet-sfucourses"
          target="_blank"
          rel="noreferrer"
          title="Source on GitHub"
          className="mt-1 w-fit opacity-80 transition-opacity hover:opacity-100"
        >
          <Image src="/icons/github.svg" alt="GitHub" width={22} height={22} />
        </a>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[#24a98b] transition-opacity hover:opacity-75"
    >
      {children}
    </a>
  );
}
