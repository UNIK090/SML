import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import StoreShell from '@/components/store/store-shell'
import PolicyArticle from '@/components/store/policy-article'
import StoreLocations from '@/components/store/store-locations'
import { MATERIAL_DISCLOSURE, PAGES, findPage } from '@/lib/pages'

// A standing page of the shop: about, contact, shipping, refunds, privacy,
// terms, and the store locator. One route serves all of them, because they are
// the same shape — a heading and sections of prose — and a policy is content,
// not a component worth eleven files.
//
// The pages are generated at build time from lib/pages, so a policy is added by
// writing it, not by wiring a route.

export function generateStaticParams() {
  return [...PAGES.map((page) => ({ slug: page.slug })), { slug: 'stores' }]
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const page = findPage(slug)
  if (page) {
    return { title: page.title, description: page.summary }
  }
  if (slug === 'stores') {
    return { title: 'Visit our store', description: 'Address, hours and directions to the shop.' }
  }
  return { title: 'Page not found' }
}

export default async function StandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  if (slug === 'stores') {
    return (
      <StoreShell
        title="Visit the store"
        eyebrow="Our stores"
        lead="Call ahead before a long journey — most pieces are one of a kind, and we would rather tell you it is in the showcase than have you arrive to find it sold."
        back={{ href: '/', label: 'Back to the shop' }}
      >
        <StoreLocations />
      </StoreShell>
    )
  }

  const page = findPage(slug)
  if (!page) notFound()

  // The disclosure is repeated on every policy page, because a customer who
  // reads only one of these should still know what they are buying.
  const showDisclosure = !page.sections.some((section) =>
    section.blocks.some((block) => block.kind === 'paragraph' && block.text === MATERIAL_DISCLOSURE),
  )

  return (
    <StoreShell
      title={page.title}
      eyebrow={page.eyebrow}
      lead={page.summary}
      back={{ href: '/', label: 'Back to the shop' }}
    >
      <PolicyArticle page={page} showDisclosure={showDisclosure} />
    </StoreShell>
  )
}
