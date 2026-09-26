'use client'

// ===========================================================================
// The storefront's selling sections.
//
// These are the parts every Indian jewellery counter site leads with, and the
// parts this shop was missing: a row of shortcuts to tap, a shelf of real
// pieces, and a band that answers "why should I buy from you?" before the
// customer has to ask.
//
// One rule governs all of it, and it matters most for a shop with a small
// catalogue:
//
//   A section only appears when the shop can genuinely fill it.
//
// There is no padding and no placeholder tiles. With two pieces the customer
// sees two good shortcuts and a two-piece shelf, which reads as a curated
// counter; six empty tiles would read as a closed shop.
// ===========================================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Flame,
  Gem,
  IndianRupee,
  LayoutGrid,
  Phone,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
} from 'lucide-react'
import ProductImageSlider from '@/components/store/product-image-slider'
import { useCart } from '@/components/store/cart'
import { rupees, telLink } from '@/lib/store'
import { offerBannerUrl, offerDate } from '@/lib/offers'
import type { PriceBand, PublicOffer, Shop, StoreCategory, StoreProduct } from '@/lib/types'

/* ---------------------------------------------------------------------------
   The rail shell
   --------------------------------------------------------------------------- */

/** A rail heading: a small gold label, a serif heading, and a "View all". */
export function RailHeading({
  eyebrow,
  icon,
  title,
  hint,
  onViewAll,
}: {
  eyebrow: string
  icon?: ReactNode
  title: string
  hint?: string
  onViewAll?: () => void
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4" data-reveal="up">
      <div className="max-w-xl">
        <p className="sf-eyebrow">
          {icon}
          {eyebrow}
        </p>
        <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        {hint && (
          <p className="mt-2 text-xs leading-6" style={{ color: 'var(--sf-muted)' }}>
            {hint}
          </p>
        )}
      </div>

      {onViewAll && (
        <button onClick={onViewAll} className="sf-link-all">
          View all <ArrowRight className="size-3.5" />
        </button>
      )}
    </header>
  )
}

/**
 * The sideways shelf.
 *
 * On a phone it is a snap-scroll rail — one piece at a time, thumb-flick, which
 * is how jewellery is actually browsed on a small screen. From tablet up it is
 * a plain grid, because hiding pieces behind a scroll when they fit helps
 * nobody.
 */
export function Rail({
  children,
  gridClassName = 'sm:grid-cols-3 lg:grid-cols-5',
  ariaLabel,
}: {
  children: ReactNode
  gridClassName?: string
  ariaLabel: string
}) {
  const scroller = useRef<HTMLUListElement | null>(null)
  const [edges, setEdges] = useState({ start: true, end: true })

  const measure = useCallback(() => {
    const node = scroller.current
    if (!node) return
    const max = node.scrollWidth - node.clientWidth
    setEdges({ start: node.scrollLeft <= 4, end: max <= 4 || node.scrollLeft >= max - 4 })
  }, [])

  useEffect(() => {
    measure()
    const node = scroller.current
    if (!node) return
    node.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      node.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [measure])

  const nudge = (direction: -1 | 1) => {
    const node = scroller.current
    if (!node) return
    node.scrollBy({ left: direction * node.clientWidth * 0.85, behavior: 'smooth' })
  }

  const scrollable = !(edges.start && edges.end)

  return (
    <div className="relative">
      <ul
        ref={scroller}
        aria-label={ariaLabel}
        className={`-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:overflow-visible sm:px-0 ${gridClassName}`}
      >
        {children}
      </ul>

      {/* Arrows only when the shelf genuinely overflows — a pair of dead arrows
          on a two-piece rail is worse than no arrows at all. */}
      {scrollable && (
        <div className="mt-5 hidden justify-end gap-2 sm:flex">
          <button
            onClick={() => nudge(-1)}
            disabled={edges.start}
            aria-label={`Scroll ${ariaLabel} backwards`}
            className="sf-rail-arrow"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => nudge(1)}
            disabled={edges.end}
            aria-label={`Scroll ${ariaLabel} forwards`}
            className="sf-rail-arrow"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------
   The festival offer
   --------------------------------------------------------------------------- */

/**
 * The festival offer band.
 *
 * A jewellery shop's year is shaped by its festivals, and an offer is the one
 * message that has to reach the customer today — before it expires. So it is
 * given its own band directly under the banner, in the shop's own maroon, with
 * the saving as the largest thing in the row.
 *
 * It renders nothing at all when there is no offer, which is the common state:
 * an empty "no offers" strip would make the shop look like it is always
 * discounting, or worse, broken. `state` and `daysLeft` are decided on the
 * server against the shop's business day, so a visitor in another timezone
 * cannot be shown a finished sale.
 */
export function OfferBanner({ offer, onShop }: { offer: PublicOffer; onShop: () => void }) {
  const running = offer.state === 'ACTIVE'
  const startsToday = offer.startsOn === offer.endsOn

  /**
   * The urgency line, and it is never allowed to overstate.
   *
   * "Last day" is said only on the actual last day, and a sale that has not
   * started yet is framed as coming up rather than running — a shop that cries
   * wolf about a deadline stops being believed when the deadline is real.
   */
  const timing = !running
    ? `Starts ${offerDate(offer.startsOn)}`
    : offer.daysLeft === 0
      ? startsToday
        ? 'Today only'
        : 'Last day today'
      : offer.daysLeft === 1
        ? 'Ends tomorrow'
        : `Ends in ${offer.daysLeft} days`

  const banner = offer.hasBanner ? offerBannerUrl(offer.id, offer.bannerVersion) : null

  return (
    <section
      className={`sf-offer-band px-4 sm:px-7 ${banner ? 'sf-offer-band-photo py-0' : 'py-6'}`}
      aria-label={running ? 'Current offer' : 'Upcoming offer'}
    >
      <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-4">
        {/*
          The uploaded festival photograph, when there is one.

          The frame keeps a fixed HEIGHT and follows the photo's own width, so a
          landscape festival banner stays landscape instead of being cropped to a
          square — which would cut the artwork off at both edges. Because the
          height is fixed, a tall upload cannot shove the collection off the
          first screen either.
        */}
        {banner && (
          <a
            href="#store"
            onClick={(event) => {
              event.preventDefault()
              onShop()
            }}
            className="sf-offer-photo"
            aria-label={`See the pieces in the ${offer.title}`}
          >
            <img src={banner} alt="" loading="lazy" />
          </a>
        )}

        <span className="sf-offer-badge">
          <Tag className="size-3.5" strokeWidth={2} />
          {running ? 'Offer' : 'Coming up'}
        </span>

        <div className="sf-offer-copy">
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl" style={{ color: 'var(--sf-heading)' }}>
            {offer.title}
          </h2>
          {offer.description && (
            <p className="mt-1 max-w-2xl text-xs leading-6 sm:text-sm" style={{ color: 'var(--sf-muted)' }}>
              {offer.description}
            </p>
          )}
        </div>

        {/* The saving, then the deadline — the two facts a customer acts on. */}
        <div className="sf-offer-action">
          <div className="text-left sm:text-right">
            <p className="sf-offer-saving tnum">{offer.savingsLabel || offer.title}</p>
            <p className="mt-0.5 text-[10px] font-semibold tracking-[0.1em] uppercase" style={{ color: 'var(--sf-muted)' }}>
              {timing}
            </p>
          </div>

          <button onClick={onShop} className="sf-btn sf-btn-gold h-10 shrink-0 px-4 text-xs">
            Shop the offer <ArrowRight className="size-3.5" />
          </button>
        </div>

        {/* The code, when the shop uses one — copied, not invented. */}
        {offer.code && (
          <p className="w-full text-[11px]" style={{ color: 'var(--sf-muted)' }}>
            Quote{' '}
            <span className="sf-offer-code tnum">{offer.code}</span> at the counter.
          </p>
        )}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------
   The Offers section
   --------------------------------------------------------------------------- */

/**
 * The Offers section: a row of bold festival cards.
 *
 * This is the section a jewellery site is expected to have during a festival —
 * big, loud, coloured cards a customer can scan in one pass and tap. Each card
 * carries the three things that decide whether an offer is worth acting on: the
 * size of the saving, the name of the festival, and how long is left.
 *
 * The banner above stays as it is: the banner is one line of shop news, this is
 * the shop's offer board. They read from the same data, so a shop that runs a
 * single offer simply sees it twice the way a real counter would — once in the
 * strip and once on the board.
 *
 * The section renders nothing when no offer belongs in it. An empty "no offers"
 * row would advertise that the shop is not running anything, and a permanent
 * discount section in the off-season makes the shop look like it never sells at
 * full price.
 */
export function OfferCards({
  offers,
  onSelect,
}: {
  offers: PublicOffer[]
  onSelect: (offer: PublicOffer) => void
}) {
  if (offers.length === 0) return null

  return (
    <section id="offers" className="scroll-mt-28 border-t border-line px-4 py-14 sm:px-7 sm:py-16">
      <div className="mx-auto w-full max-w-[1400px]">
        <header className="mb-8 text-center" data-reveal="up">
          <p className="sf-eyebrow">Festival offers</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Celebrate for less</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7" style={{ color: 'var(--sf-muted)' }}>
            Limited-time savings on the pieces you have been looking at. Tap an offer to see what is included.
          </p>
        </header>

        {/*
          One, two or three cards per row — never more.

          These cards are large on purpose: the percentage has to be readable at
          a glance from across a room, the way a printed festival board is. Four
          across would shrink the number that is the whole point.
        */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offers.map((offer, index) => (
            <OfferCard key={offer.id} offer={offer} index={index} onSelect={() => onSelect(offer)} />
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * One festival offer card.
 *
 * The saving is the largest element and the festival name sits above it, which
 * is the reading order a banner of this kind uses: "DIWALI OFFER — 20% OFF".
 * The uploaded artwork, when there is any, is the card's background rather than
 * a separate thumbnail, because that is what makes a festival board feel like
 * artwork instead of a coupon.
 */
function OfferCard({
  offer,
  index,
  onSelect,
}: {
  offer: PublicOffer
  index: number
  onSelect: () => void
}) {
  const banner = offer.hasBanner ? offerBannerUrl(offer.id, offer.bannerVersion) : null

  /**
   * The saving, split so the unit can be set smaller.
   *
   * "20%" next to a small "OFF" reads far better at this size than "20% off"
   * set as one line, and it is the pattern every festival board already uses.
   */
  const amount = offer.discountType === 'flat' ? rupees(offer.discountValue) : `${Math.round(offer.discountValue * 100) / 100}%`

  /**
   * The deadline line, phrased so it can never overstate.
   *
   * "Last day" appears only on the actual last day, and an offer ending tomorrow
   * says so rather than claiming hours remain when a full day does.
   */
  const timing =
    offer.daysLeft === 0
      ? offer.startsOn === offer.endsOn
        ? 'Today only'
        : 'Last day today'
      : offer.daysLeft === 1
        ? 'Ends tomorrow'
        : `Ends in ${offer.daysLeft} days`

  return (
    <article
      className="sf-offer-card"
      data-accent={offer.accent}
      data-reveal="up"
      data-reveal-delay={Math.min(index, 4) * 80}
    >
      {/* The uploaded artwork, if any, sits behind the text as a soft wash. */}
      {banner && <img src={banner} alt="" loading="lazy" className="sf-offer-card-art" />}

      <div className="sf-offer-card-body">
        <p className="sf-offer-card-label">{offer.title}</p>

        <p className="sf-offer-card-amount">
          <span className="tnum">{amount}</span>{' '}
          <span className="sf-offer-card-unit">OFF</span>
        </p>

        {offer.description && <p className="sf-offer-card-desc">{offer.description}</p>}

        <p className="sf-offer-card-timing">{timing}</p>

        <div className="sf-offer-card-foot">
          <button onClick={onSelect} className="sf-offer-card-btn">
            Shop Now <ArrowRight className="size-3.5" />
          </button>

          {offer.code && (
            <span className="sf-offer-card-code tnum">CODE: {offer.code}</span>
          )}
        </div>
      </div>
    </article>
  )
}

/* ---------------------------------------------------------------------------
   Shop by category
   --------------------------------------------------------------------------- */

/** Round category shortcuts, each showing a real photo from that category. */
export function CategoryRail({
  categories,
  onSelect,
  onViewAll,
}: {
  categories: StoreCategory[]
  onSelect: (category: string) => void
  onViewAll?: () => void
}) {
  if (categories.length === 0) return null

  // Past a handful the row becomes a scroll strip rather than wrapping into a
  // ragged block, which is how the counter sites present a long category list.
  const many = categories.length > 6

  return (
    <section className="border-t border-line px-3 py-12 sm:px-7 sm:py-14">
      <div className="mx-auto w-full max-w-[1400px]">
        <RailHeading
          eyebrow="Shop by category"
          icon={<LayoutGrid className="size-3.5" style={{ color: 'var(--sf-gold-deep)' }} />}
          title="Every kind of piece we keep at the counter"
          hint="Tap a tray to see just what is in it today."
          onViewAll={onViewAll}
        />

        <div
          className={
            many
              ? '-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:flex-wrap sm:justify-start sm:gap-6 sm:px-0'
              : 'flex flex-wrap justify-center gap-4 sm:justify-start sm:gap-6'
          }
          data-reveal="up"
        >
          {categories.map((entry) => (
            <button
              key={entry.name}
              onClick={() => onSelect(entry.name)}
              className="sf-circle w-[4.5rem] shrink-0 snap-start sm:w-[5.25rem]"
            >
              <span className="sf-circle-ring">
                {entry.imageCode ? (
                  <img
                    src={`/api/store/image?id=${entry.imageCode}`}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <Gem className="size-5" style={{ color: 'var(--sf-gold-deep)' }} strokeWidth={1.3} />
                )}
              </span>
              <span className="text-center text-[11px] leading-4 font-medium" style={{ color: 'var(--sf-heading)' }}>
                {entry.name}
              </span>
              <span className="tnum text-[10px]" style={{ color: 'var(--sf-muted)' }}>
                {entry.count} {entry.count === 1 ? 'piece' : 'pieces'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------
   Shop in budget
   --------------------------------------------------------------------------- */

/**
 * "Shop in budget", priced for an affordable counter.
 *
 * Bands are the ones a one-gram / panchaloha / silver shop actually sells in —
 * a few hundred to a few thousand rupees, not bridal bands. Each carries a live
 * count, so the shortcut answers "is this shelf worth opening?" before a tap.
 */
export function BudgetRail({
  bands,
  onSelect,
  activeBand,
}: {
  bands: PriceBand[]
  onSelect: (band: PriceBand | null) => void
  activeBand: PriceBand | null
}) {
  if (bands.length === 0) return null

  return (
    <section className="sf-band-gold border-t border-line px-3 py-12 sm:px-7 sm:py-14">
      <div className="mx-auto w-full max-w-[1400px]">
        <RailHeading
          eyebrow="Shop in budget"
          icon={<IndianRupee className="size-3.5" style={{ color: 'var(--sf-gold-deep)' }} />}
          title="Beautiful pieces at prices that fit"
          hint="Tell us what you would like to spend and we will show only what falls inside it."
        />

        <div className="flex flex-wrap justify-center gap-2.5 sm:justify-start sm:gap-3" data-reveal="up">
          <button onClick={() => onSelect(null)} data-active={activeBand === null} className="sf-band-tile">
            <Tag className="size-4" style={{ color: 'var(--sf-gold-deep)' }} />
            <span className="mt-2 block text-xs font-semibold" style={{ color: 'var(--sf-heading)' }}>
              Any budget
            </span>
            <span className="mt-0.5 block text-[10px]" style={{ color: 'var(--sf-muted)' }}>
              See everything
            </span>
          </button>

          {bands.map((band) => (
            <button
              key={band.label}
              onClick={() => onSelect(band)}
              data-active={activeBand?.label === band.label}
              className="sf-band-tile"
            >
              <IndianRupee className="size-4" style={{ color: 'var(--sf-gold-deep)' }} />
              <span className="mt-2 block text-xs font-semibold" style={{ color: 'var(--sf-heading)' }}>
                {band.label}
              </span>
              <span className="tnum mt-0.5 block text-[10px]" style={{ color: 'var(--sf-muted)' }}>
                {band.count} {band.count === 1 ? 'piece' : 'pieces'}
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------
   Best sellers / new arrivals
   --------------------------------------------------------------------------- */

/**
 * The shop's most-sold pieces — only ever shown when the shop has sold some.
 *
 * The heading changes with the evidence. With real sales it says "best sellers"
 * and ranks by units moved. With none it says "new at the counter" and shows
 * what was published most recently. Either way the shelf is full and the words
 * are true; a false "best seller" is a lie the shopkeeper answers for at the
 * counter.
 */
export function BestSellersRail({
  products,
  hasSalesData,
  sold,
  onViewAll,
}: {
  products: StoreProduct[]
  hasSalesData: boolean
  sold: Record<number, number>
  onViewAll?: () => void
}) {
  if (products.length === 0) return null

  return (
    <section className="border-t border-line px-3 py-12 sm:px-7 sm:py-14">
      <div className="mx-auto w-full max-w-[1400px]">
        <RailHeading
          eyebrow={hasSalesData ? 'Best sellers' : 'New at the counter'}
          icon={
            hasSalesData ? (
              <Flame className="size-3.5" style={{ color: 'var(--sf-maroon)' }} />
            ) : (
              <Sparkles className="size-3.5" style={{ color: 'var(--sf-gold-deep)' }} />
            )
          }
          title={hasSalesData ? 'What customers keep coming back for' : 'Freshly added to the showcase'}
          hint={
            hasSalesData
              ? 'Ranked from real sales, over the counter and online — not from a list we picked.'
              : 'Our newest designs. As pieces start selling, this shelf becomes our best sellers.'
          }
          onViewAll={onViewAll}
        />

        <Rail ariaLabel="Our most loved pieces" gridClassName="sm:grid-cols-3 lg:grid-cols-5">
          {products.map((product, index) => (
            <li key={product.code} className="w-[9rem] shrink-0 snap-start sm:w-auto">
              <CompactCard
                product={product}
                index={index}
                sold={hasSalesData ? (sold[product.code] ?? 0) : 0}
              />
            </li>
          ))}
        </Rail>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------
   Editorial — the collection story
   --------------------------------------------------------------------------- */

/**
 * The editorial band that gives each collection a name and a story, written for
 * what this shop actually sells.
 *
 * Each card is a real collection with its real count and starting price, so
 * tapping one lands on pieces that exist.
 */
const STORIES: { name: string; kicker: string; body: string; icon: typeof Gem }[] = [
  {
    name: 'One-gram',
    kicker: 'The everyday favourite',
    body: 'Light, comfortable and made to give the rich look of gold jewellery — without the weight or the price. Perfect for daily wear and gifting.',
    icon: Sparkles,
  },
  {
    name: 'Panchaloha',
    kicker: 'Traditional, made modern',
    body: 'The classic five-metal alloy, crafted into temple-inspired and antique-finish designs that hold their look for years.',
    icon: Gem,
  },
  {
    name: 'Silver',
    kicker: 'Quiet, versatile, affordable',
    body: 'Clean silver designs for everyday and occasion wear — easy on the budget and easy to pair with anything you already own.',
    icon: ShieldCheck,
  },
]

export function CollectionStories({
  collections,
  onSelect,
}: {
  collections: { name: string; count: number; from: number }[]
  onSelect: (name: string) => void
}) {
  // Match the shop's own collection names against the three stories. Only what
  // the shop stocks is shown, so the band can never describe a shelf that does
  // not exist — and with one collection it shows one card.
  const matched = STORIES.map((story) => {
    const key = story.name.split(' ')[0].toLowerCase()
    const found = collections.find((entry) => entry.name.toLowerCase().includes(key))
    return found ? { ...story, collection: found } : null
  }).filter((entry): entry is (typeof STORIES)[number] & { collection: (typeof collections)[number] } => entry !== null)

  if (matched.length === 0) return null

  return (
    <section className="sf-band border-t border-line px-3 py-12 sm:px-7 sm:py-16">
      <div className="mx-auto w-full max-w-[1400px]">
        <header className="mb-8 max-w-2xl" data-reveal="up">
          <p className="sf-eyebrow">
            <Gem className="size-3.5" style={{ color: 'var(--sf-gold-deep)' }} /> Our collections
          </p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">Know what you are buying</h2>
          <p className="mt-3 text-sm leading-7">
            Each of our shelves is a different material, and each has its own look and price. Here is what they are.
          </p>
        </header>

        <div
          className={`grid gap-4 ${matched.length === 1 ? 'sm:max-w-md' : matched.length === 2 ? 'sm:grid-cols-2' : 'lg:grid-cols-3'
            }`}
        >
          {matched.map((story, index) => (
            <button
              key={story.name}
              onClick={() => onSelect(story.collection.name)}
              data-reveal="up"
              data-reveal-delay={index * 80}
              className="sf-card group flex flex-col p-5 text-left sm:p-6"
            >
              <span
                className="flex size-10 items-center justify-center rounded-full sm:size-11"
                style={{ background: 'var(--sf-gold-wash)', color: 'var(--sf-gold-deep)' }}
              >
                <story.icon className="size-4.5 sm:size-5" strokeWidth={1.5} />
              </span>

              <p className="mt-4 text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'var(--sf-gold-deep)' }}>
                {story.kicker}
              </p>
              <h3 className="mt-1.5 text-sm font-semibold sm:text-base" style={{ color: 'var(--sf-heading)' }}>
                {story.name}
              </h3>
              <p className="mt-2 text-xs leading-6" style={{ color: 'var(--sf-body)' }}>
                {story.body}
              </p>

              <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5 text-xs">
                <span style={{ color: 'var(--sf-muted)' }}>
                  {story.collection.count} {story.collection.count === 1 ? 'piece' : 'pieces'} · from{' '}
                  {rupees(story.collection.from)}
                </span>
                <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: 'var(--sf-maroon)' }}>
                  Browse <ArrowRight className="size-3.5 transition group-hover:translate-x-1" />
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------
   The promise band
   --------------------------------------------------------------------------- */

/**
 * Why buy here — the trust band that sits before the customer reaches a human.
 *
 * Deliberately the promises an affordable one-gram and panchaloha counter can
 * stand behind: what the piece is made of, what the price means, and what
 * happens after the sale. No certification claims, no buyback guarantees,
 * nothing the shop could not honour at the counter tomorrow.
 */
const PROMISES: { icon: typeof ShieldCheck; title: string; body: string }[] = [
  {
    icon: BadgeCheck,
    title: 'The material is named plainly',
    body: 'Every piece says whether it is one-gram gold, panchaloha or silver. You never have to guess what you are buying.',
  },
  {
    icon: Tag,
    title: 'The price is the price',
    body: 'What you see on the card is what the shop asks for. No weighing charges added at the counter, no surprise at billing.',
  },
  {
    icon: Gem,
    title: 'Gold-look designs, easy prices',
    body: 'One-gram and panchaloha are made to give the rich look of gold jewellery at prices that fit an everyday budget.',
  },
  {
    icon: ShieldCheck,
    title: 'Checked before it leaves',
    body: 'Every piece is inspected and packed at the counter. If something is not right, tell us and we will set it right.',
  },
  {
    icon: Sparkles,
    title: 'Care and exchange, explained',
    body: 'Ask us about product care, resizing and exchange terms before you buy. We would rather explain first than fix later.',
  },
]

export function PromiseBand() {
  return (
    <section className="border-t border-line px-3 py-12 sm:px-7 sm:py-14">
      <div className="mx-auto w-full max-w-[1400px]">
        <header className="mb-6 max-w-2xl" data-reveal="up">
          <p className="sf-eyebrow">
            <ShieldCheck className="size-3.5" style={{ color: 'var(--sf-gold-deep)' }} /> Our promise
          </p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">Buying from us, plainly explained</h2>
        </header>

        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {PROMISES.map((promise, index) => (
            <li key={promise.title}>
              <div className="sf-card h-full p-5 sm:p-6" data-reveal="up" data-reveal-delay={Math.min(index, 4) * 70}>
                <span
                  className="flex size-10 items-center justify-center rounded-full"
                  style={{ background: 'var(--sf-gold-wash)', color: 'var(--sf-gold-deep)' }}
                >
                  <promise.icon className="size-4.5" strokeWidth={1.6} />
                </span>
                <h3 className="mt-4 text-sm font-semibold" style={{ color: 'var(--sf-heading)' }}>
                  {promise.title}
                </h3>
                <p className="mt-2 text-xs leading-6" style={{ color: 'var(--sf-body)' }}>
                  {promise.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------
   How ordering works
   --------------------------------------------------------------------------- */

/**
 * The three steps between wanting a piece and holding it.
 *
 * This band removes the one doubt that stops an online jewellery purchase:
 * "what happens if I click?" It answers that before the customer has to ask,
 * and says plainly that no payment is taken on the site.
 */
export function OrderSteps({ shop }: { shop: (Shop & { storeHours?: string | null }) | null }) {
  const call = telLink(shop?.phone)

  const steps = [
    {
      icon: LayoutGrid,
      title: '1 · Pick your piece',
      body: 'Browse the counter and add what you like to your basket. Prices are shown on every card.',
    },
    {
      icon: Phone,
      title: '2 · We call you',
      body: `Place the order and we ring you back${shop?.phone ? ` on ${shop.phone}` : ''} to confirm the piece and the timing.`,
    },
    {
      icon: Store,
      title: '3 · Collect or receive',
      body: 'Pick it up at the shop or have it delivered. Nothing is charged on the website — you pay at handover.',
    },
  ]

  return (
    <section className="sf-band border-t border-line px-3 py-12 sm:px-7 sm:py-14">
      <div className="mx-auto w-full max-w-[1400px]">
        <header className="mb-8 max-w-2xl" data-reveal="up">
          <p className="sf-eyebrow">
            <Phone className="size-3.5" style={{ color: 'var(--sf-gold-deep)' }} /> How ordering works
          </p>
          <h2 className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">Three steps, no payment online</h2>
          <p className="mt-3 text-sm leading-7">
            Ordering is meant to feel like talking to the counter, not checking out of a supermarket.
          </p>
        </header>

        <ol className="grid gap-4 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title}>
              <div className="sf-card h-full p-5 sm:p-6" data-reveal="up" data-reveal-delay={index * 90}>
                <span
                  className="flex size-10 items-center justify-center rounded-full"
                  style={{ background: 'var(--sf-maroon)', color: '#fff' }}
                >
                  <step.icon className="size-4.5" strokeWidth={1.6} />
                </span>
                <h3 className="mt-4 text-sm font-semibold" style={{ color: 'var(--sf-heading)' }}>
                  {step.title}
                </h3>
                <p className="mt-2 text-xs leading-6" style={{ color: 'var(--sf-body)' }}>
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        {call && (
          <p className="mt-6 text-xs" style={{ color: 'var(--sf-muted)' }}>
            Would rather just talk? Call us on{' '}
            <a href={call} className="font-semibold hover:underline" style={{ color: 'var(--sf-maroon)' }}>
              {shop?.phone}
            </a>
            {shop?.storeHours ? ` · open ${shop.storeHours}` : ''}
          </p>
        )}
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------
   The counter notice
   --------------------------------------------------------------------------- */

/** The wide notice strip the counter sites run between shelves. */
export function CounterNotice({
  shop,
  whatsapp,
  onBrowse,
}: {
  shop: (Shop & { storeHours?: string | null }) | null
  whatsapp: string | null
  onBrowse: () => void
}) {
  const call = telLink(shop?.phone)

  return (
    <section className="border-t border-line px-3 py-12 sm:px-7 sm:py-14">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="sf-counter-banner p-6 sm:p-10" data-reveal="up">
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-xl">
              <p className="sf-eyebrow">
                <Sparkles className="size-3.5" style={{ color: 'var(--sf-gold-deep)' }} /> Not sure what to pick?
              </p>
              <h2 className="mt-3 text-lg font-semibold tracking-tight sm:text-2xl">
                Come to the counter, or just message us.
              </h2>
              <p className="mt-3 text-sm leading-7" style={{ color: 'var(--sf-body)' }}>
                Tell us the occasion and your budget, and we will show you what we have in one-gram gold, panchaloha and
                silver. If you would rather see a piece in person, we are open {shop?.storeHours ?? 'during our usual hours'}.
              </p>
            </div>

            <div className="flex flex-wrap gap-2.5 sm:gap-3">
              <button onClick={onBrowse} className="sf-btn sf-btn-gold h-11 px-5 text-sm">
                Browse everything
              </button>
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noreferrer" className="sf-btn sf-btn-ghost h-11 px-5 text-sm">
                  Ask on WhatsApp
                </a>
              )}
              {call && (
                <a href={call} className="sf-btn sf-btn-ghost h-11 px-5 text-sm">
                  <Phone className="size-4" /> Call the shop
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------------------
   The compact card a shelf uses
   --------------------------------------------------------------------------- */

/**
 * A shelf card, deliberately the same compact size as the grid card.
 *
 * The grid card carries the enquiry and share actions; a shelf card is a
 * glimpse — photo, name, price, add — so a rail stays scannable. Sized to match
 * the grid so the two do not look like they came from different shops.
 */
export function CompactCard({
  product,
  index = 0,
  sold = 0,
}: {
  product: StoreProduct
  index?: number
  sold?: number
}) {
  const { add, has } = useCart()
  const inBasket = has(product.code)
  const hasDiscount = product.originalPrice > product.price
  const discountPct = hasDiscount
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0
  const link = `/product/${encodeURIComponent(String(product.code))}`

  return (
    <article
      className="sf-card sf-card-sheen group flex h-full flex-col"
      data-reveal="up"
      data-reveal-delay={Math.min(index, 6) * 45}
    >
      <a href={link} aria-label={`Open ${product.name}`} className="block">
        <span className="sf-card-media relative block aspect-square overflow-hidden">
          <ProductImageSlider
            product={product}
            className="size-full"
            overlay={
              <>
                {product.badge && (
                  <span
                    className="pointer-events-none absolute top-2 left-2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.1em] text-white uppercase"
                    style={{ background: 'var(--sf-maroon)' }}
                  >
                    {product.badge}
                  </span>
                )}
                {hasDiscount && (
                  <span
                    className="pointer-events-none absolute top-2 right-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                    style={{ background: 'var(--sf-gold-deep)' }}
                  >
                    –{discountPct}%
                  </span>
                )}
                {sold > 0 && (
                  <span
                    className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.1em] text-white uppercase"
                    style={{ background: 'var(--sf-maroon)' }}
                  >
                    <Flame className="size-2.5" />
                    {sold > 1 ? `${sold} sold` : 'Popular'}
                  </span>
                )}
              </>
            }
          />
        </span>
      </a>

      <div className="flex flex-1 flex-col p-2.5 sm:p-3">
        <p className="text-[9px] font-semibold tracking-[0.16em] uppercase" style={{ color: 'var(--sf-gold-deep)' }}>
          {product.collection}
        </p>
        <h3 className="mt-1 line-clamp-2 text-[12px] leading-4 font-medium sm:text-[13px] sm:leading-5" style={{ color: 'var(--sf-heading)' }}>
          {product.name}
        </h3>

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <div className="min-w-0">
            <p className="tnum text-sm font-semibold sm:text-[15px]" style={{ color: 'var(--sf-maroon)' }}>
              {rupees(product.price)}
            </p>
            {hasDiscount && (
              <p className="tnum text-[10px] line-through decoration-1 decoration-dashed" style={{ color: 'var(--sf-muted)' }}>
                {rupees(product.originalPrice)}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => add(product)}
            aria-label={inBasket ? `${product.name} is in your basket` : `Add ${product.name} to basket`}
            className={`sf-btn h-7 shrink-0 px-2 text-[11px] ${inBasket ? 'border border-line bg-cream' : 'sf-btn-gold'}`}
            style={inBasket ? { color: 'var(--sf-maroon)' } : undefined}
          >
            {inBasket ? 'Added' : 'Add'}
          </button>
        </div>
      </div>
    </article>
  )
}