'use client'

// Renders one standing page (a policy, or the about page) from its data.
//
// Deliberately plain: a policy is read, not browsed, so it is a single measured
// column of text with a sticky contents list beside it on a wide screen. The
// contents list is built from the sections themselves, so a page that grows a
// section gets a contents entry for free and the two cannot disagree.

import type { PolicySection } from '@/lib/pages'
import { MATERIAL_DISCLOSURE } from '@/lib/pages'
import { Info } from 'lucide-react'

export default function PolicyArticle({
  page,
  showDisclosure,
}: {
  page: { title: string; sections: PolicySection[] }
  /** True when the page has not already stated the material disclosure itself. */
  showDisclosure: boolean
}) {
  // Anchor ids derived from the heading, stable across renders and unique within
  // a page because the headings are the author's own words.
  const anchor = (heading: string) =>
    heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-12">
      <article className="min-w-0">
        {showDisclosure && (
          <div className="mb-8 flex items-start gap-3 rounded-xl border border-gold bg-gold-soft px-5 py-4">
            <Info className="mt-0.5 size-4 shrink-0" style={{ color: 'var(--sf-gold-deep)' }} />
            <p className="text-xs leading-6 text-gold-deep">{MATERIAL_DISCLOSURE}</p>
          </div>
        )}

        <div className="flex flex-col gap-9">
          {page.sections.map((section) => (
            <section key={section.heading} id={anchor(section.heading)} className="scroll-mt-28">
              <h2 className="text-lg font-semibold tracking-tight sm:text-xl">{section.heading}</h2>

              <div className="mt-3 flex flex-col gap-3">
                {section.blocks.map((block, index) => {
                  if (block.kind === 'list') {
                    return (
                      <ul key={index} className="flex flex-col gap-2.5 pl-0.5">
                        {block.items.map((item) => (
                          <li key={item} className="flex items-start gap-2.5 text-sm leading-7">
                            <span
                              className="mt-3 size-1.5 shrink-0 rounded-full"
                              style={{ background: 'var(--sf-gold-deep)' }}
                              aria-hidden
                            />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    )
                  }

                  if (block.kind === 'note') {
                    return (
                      <p
                        key={index}
                        className="rounded-lg border-l-2 bg-cream px-4 py-3 text-xs leading-6"
                        style={{ borderColor: 'var(--sf-gold)' }}
                      >
                        {block.text}
                      </p>
                    )
                  }

                  return (
                    <p key={index} className="text-sm leading-7">
                      {block.text}
                    </p>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </article>

      {/*
        The contents list. It is a nicety on a long policy and pointless on a
        short one, so it only appears once a page has enough sections to be worth
        jumping around in.
      */}
      {page.sections.length >= 3 && (
        <nav className="hidden lg:sticky lg:top-28 lg:block" aria-label="On this page">
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'var(--sf-muted)' }}>
            On this page
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 border-l border-line pl-4">
            {page.sections.map((section) => (
              <li key={section.heading}>
                <a
                  href={`#${anchor(section.heading)}`}
                  className="text-xs leading-5 transition hover:underline"
                  style={{ color: 'var(--sf-body)' }}
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  )
}
