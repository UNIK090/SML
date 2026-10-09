// ===========================================================================
// The shop's standing pages — the ones a customer reads before they trust a
// shop with money: how a piece is made, how it is sent, what happens if it is
// wrong, what the shop does with a phone number.
//
// These live here rather than as database rows on purpose. Unlike a product or
// an offer, a policy is not something a shopkeeper changes on a Tuesday: it is
// the promise the shop is held to, and it should be reviewed and versioned with
// the code that prints it. The wording below is deliberately narrow — it claims
// only what an affordable one-gram and panchaloha counter can actually stand
// behind at the counter tomorrow, and it names the material plainly.
//
// A page is described as data (sections of heading + paragraphs and, where it
// helps, a list) so one renderer can draw all of them and a new policy is a new
// entry here, not a new component.
// ===========================================================================

export type PolicyBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'note'; text: string }

export type PolicySection = {
  heading: string
  blocks: PolicyBlock[]
}

export type StandingPage = {
  /** URL segment under /pages. */
  slug: string
  /** The <title> and the page's own <h1>. */
  title: string
  /** One line under the heading, and the meta description. */
  summary: string
  /** Small-caps label above the heading. */
  eyebrow: string
  sections: PolicySection[]
}

// ---------------------------------------------------------------------------
// The honest-material note
// ---------------------------------------------------------------------------
//
// Every one of these pages carries it, because it is the single fact a customer
// must not miss: this is imitation jewellery. Burying it on one page and
// omitting it elsewhere is how a shop ends up arguing at the counter.

export const MATERIAL_DISCLOSURE =
  'Every piece on this website is imitation jewellery — one-gram gold, panchaloha or silver. It is not made of solid gold and no piece is hallmarked. Prices reflect the design and the finish, not the metal weight.'

export const PAGES: StandingPage[] = [
  // -------------------------------------------------------------------------
  {
    slug: 'about',
    title: 'About the shop',
    summary: 'Who we are, what we keep on the counter, and how we price a piece.',
    eyebrow: 'About us',
    sections: [
      {
        heading: 'What we do',
        blocks: [
          {
            kind: 'paragraph',
            text: 'We are a family jewellery counter selling one-gram gold, panchaloha and silver designs. Our work is simple: pick designs that look rich, make them well, and sell them at a price an everyday budget can carry.',
          },
          {
            kind: 'paragraph',
            text: 'The same catalogue you see here is what sits in the showcase. Nothing is listed online that we would not hand you across the counter.',
          },
        ],
      },
      {
        heading: 'How we describe a piece',
        blocks: [
          {
            kind: 'paragraph',
            text: MATERIAL_DISCLOSURE,
          },
          {
            kind: 'list',
            items: [
              'One-gram gold: a thin gold covering over a base metal, finished to give the look of gold jewellery.',
              'Panchaloha: the traditional five-metal alloy, used for temple-style and antique-finish designs.',
              'Silver: silver-finish pieces for everyday and occasion wear.',
            ],
          },
        ],
      },
      {
        heading: 'How we price',
        blocks: [
          {
            kind: 'paragraph',
            text: 'The price shown on a card is the price you pay. There is no separate weighing charge, making charge or stone charge added at billing — what you saw is what the bill says.',
          },
          {
            kind: 'note',
            text: 'If a piece is photographed at an angle, the size and colour on screen can differ slightly from the piece in your hand. Ask us for the exact measurements before you buy.',
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    slug: 'contact',
    title: 'Contact us',
    summary: 'Call, message or visit — whichever is quickest for you.',
    eyebrow: 'Get in touch',
    sections: [
      {
        heading: 'Reach a person, not a form',
        blocks: [
          {
            kind: 'paragraph',
            text: 'The fastest way to get an answer is to call the shop or send us a WhatsApp message. Both reach the counter directly, and both are answered during shop hours.',
          },
          {
            kind: 'paragraph',
            text: 'If your question is about a piece you saw on the website, quote the item number — it is printed on every product card as #1042, and it tells us exactly which piece you mean.',
          },
        ],
      },
      {
        heading: 'What we can help with',
        blocks: [
          {
            kind: 'list',
            items: [
              'Whether a piece is still available, and its exact size and finish',
              'Gift packing, and whether a piece can be ready by a particular date',
              'The status of an order you have already placed',
              'Care, cleaning and exchange terms for a piece you own',
            ],
          },
        ],
      },
      {
        heading: 'If you have already ordered',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Keep your order number to hand. It opens your order straight from the Track order page, and it is the first thing we will ask for on the phone.',
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    slug: 'shipping',
    title: 'Shipping and delivery',
    summary: 'How a piece gets from the counter to you, and how long it takes.',
    eyebrow: 'Shipping policy',
    sections: [
      {
        heading: 'Two ways to receive an order',
        blocks: [
          {
            kind: 'list',
            items: [
              'Store pickup — collect from the counter at no charge. We will call you when the piece is packed and ready.',
              'Home delivery — we arrange the courier and confirm the time with you on the phone.',
            ],
          },
          {
            kind: 'paragraph',
            text: 'You choose which one when you place the order. You can also change your mind by calling the shop before the piece is dispatched.',
          },
        ],
      },
      {
        heading: 'When we dispatch',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Nothing is dispatched until we have spoken to you and confirmed the piece and the address. Orders placed during shop hours are normally confirmed the same day; orders placed late in the evening are confirmed the next working day.',
          },
          {
            kind: 'note',
            text: 'Delivery timelines depend on the courier and your pincode, so we quote them when we call rather than promising a date the website cannot guarantee.',
          },
        ],
      },
      {
        heading: 'Delivery charges',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Delivery is arranged by the shop. Where a charge applies it is shown in your basket before you place the order, and orders above the free-delivery threshold carry no delivery charge.',
          },
        ],
      },
      {
        heading: 'Checking your order on arrival',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Please open the parcel in front of the delivery person where possible. If the piece is damaged in transit, refuse the parcel and call us the same day — a transit problem reported late is very hard for us to claim on your behalf.',
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    slug: 'refunds',
    title: 'Returns and refunds',
    summary: 'What to do if a piece is not right, and what we can and cannot take back.',
    eyebrow: 'Refund policy',
    sections: [
      {
        heading: 'Tell us first',
        blocks: [
          {
            kind: 'paragraph',
            text: 'If something is wrong with a piece, call or message us before sending it back. Most problems — a size, a clasp, a finish — are quicker to settle at the counter than over a courier, and we would rather fix it than have you return it.',
          },
        ],
      },
      {
        heading: 'What we accept',
        blocks: [
          {
            kind: 'list',
            items: [
              'A piece that arrived damaged, or that is not the piece you ordered, reported within 48 hours of delivery.',
              'A manufacturing defect — a broken clasp, a loose fitting, a faulty finish — reported within 7 days of delivery.',
              'A piece still sealed in its original packing, with its tag and bill.',
            ],
          },
        ],
      },
      {
        heading: 'What we cannot accept',
        blocks: [
          {
            kind: 'list',
            items: [
              'A piece that has been worn, cleaned with chemicals, resized or repaired elsewhere.',
              'A piece damaged by misuse, perfume, water or rough handling.',
              'A customised or made-to-order piece, because it was made specifically for you.',
              'Earrings, for reasons of hygiene.',
            ],
          },
          {
            kind: 'note',
            text: 'Every return is inspected at the counter before it is approved, and the bill must come with it.',
          },
        ],
      },
      {
        heading: 'How a refund is paid',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Once the piece is received and inspected, we refund the amount you paid. A refund is made the way it was paid — cash at the counter, or transferred back to you. Approved returns are settled within 7 working days. Delivery charges, where they were paid separately, are not refunded unless the fault was ours.',
          },
          {
            kind: 'paragraph',
            text: 'You may also choose an exchange instead of a refund, up to the value of the piece. An exchange is settled at the counter, so we can show you the alternatives in person.',
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    slug: 'privacy',
    title: 'Privacy',
    summary: 'What we collect, why, and what we never do with it.',
    eyebrow: 'Privacy policy',
    sections: [
      {
        heading: 'What we collect',
        blocks: [
          {
            kind: 'list',
            items: [
              'When you place an order: your name, mobile number, and — if you choose delivery — your address. An email is optional and only used if you give it.',
              'When you buy at the counter: the name and number you give for the bill.',
              'When you browse: nothing that identifies you. The basket is kept in your own browser and is not sent to us until you place the order.',
            ],
          },
        ],
      },
      {
        heading: 'Why we keep it',
        blocks: [
          {
            kind: 'paragraph',
            text: 'To confirm and deliver your order, to keep a record of what was sold and to whom for accounting and warranty purposes, and to answer you when you call about a piece you bought.',
          },
          {
            kind: 'paragraph',
            text: 'Your mobile number is the identity we use for your purchase history, so a bill can be found again by the number that was given at the counter.',
          },
        ],
      },
      {
        heading: 'What we do not do',
        blocks: [
          {
            kind: 'list',
            items: [
              'We do not take card or bank details on this website. No payment is collected online at all — you pay at the counter or on delivery.',
              'We do not sell, rent or trade your name, number or address to anyone.',
              'We do not send marketing messages to a number that was given only for a bill.',
            ],
          },
        ],
      },
      {
        heading: 'Your choices',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Ask us at the counter, or call, to see what we hold against your number, to correct it, or to have it closed. We will do it. A bill already issued is kept as an accounting record, because we are required to keep it.',
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    slug: 'terms',
    title: 'Terms of service',
    summary: 'The plain terms you accept when you order from this website.',
    eyebrow: 'Terms of service',
    sections: [
      {
        heading: 'What this website is',
        blocks: [
          {
            kind: 'paragraph',
            text: 'This website is a showcase and an order request system. Placing an order here is a request to buy, not a completed sale: the sale is completed when the shop confirms the piece, the price and the delivery with you by phone.',
          },
          {
            kind: 'paragraph',
            text: MATERIAL_DISCLOSURE,
          },
        ],
      },
      {
        heading: 'Prices and availability',
        blocks: [
          {
            kind: 'list',
            items: [
              'Prices are in Indian rupees and are set by the shop. They may change without notice.',
              'Stock is single-piece for most designs. An order is confirmed only after we verify the piece is still on the counter.',
              'If a piece sells out before we confirm your order, we will tell you and offer an alternative or cancel the order — you will not be charged for it.',
            ],
          },
        ],
      },
      {
        heading: 'Colour, size and photographs',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Photographs are taken of the actual pieces, but screen colour, lighting and angle change how a design reads. Sizes quoted are approximate. If the exact measurement matters to you, ask before you order — it is a question we are always happy to answer.',
          },
        ],
      },
      {
        heading: 'Payment',
        blocks: [
          {
            kind: 'paragraph',
            text: 'No payment is taken on this website. Payment is made at the shop or on delivery, as agreed when we confirm the order.',
          },
        ],
      },
      {
        heading: 'Using the website fairly',
        blocks: [
          {
            kind: 'list',
            items: [
              'Do not place an order you do not intend to collect or pay for. Repeated abandoned orders may lead us to ask for confirmation before accepting the next one.',
              'The photographs, descriptions and design names on this site belong to the shop and may not be reused commercially without permission.',
            ],
          },
        ],
      },
    ],
  },
]

/** Lookup by slug. Returns undefined for a page that does not exist. */
export function findPage(slug: string): StandingPage | undefined {
  return PAGES.find((page) => page.slug === slug)
}

// The footer groups. Kept beside the pages themselves so a link and its page can
// never drift apart — adding a page above without adding it here is a mistake
// that shows up immediately, because nothing links to it.
export const FOOTER_HELP: { label: string; href: string }[] = [
  { label: 'Contact us', href: '/pages/contact' },
  { label: 'Shipping policy', href: '/pages/shipping' },
  { label: 'Refund policy', href: '/pages/refunds' },
  { label: 'Privacy policy', href: '/pages/privacy' },
  { label: 'Terms of service', href: '/pages/terms' },
]

export const FOOTER_QUICK: { label: string; href: string }[] = [
  { label: 'Shop all pieces', href: '/#store' },
  { label: 'About us', href: '/pages/about' },
  { label: 'Our stores', href: '/pages/stores' },
  { label: 'My orders', href: '/orders' },
  { label: 'My account', href: '/account' },
]

export const FOOTER_DISCOVER: { label: string; href: string }[] = [
  { label: 'Best selling', href: '/#store' },
  { label: 'New arrivals', href: '/#store' },
  { label: 'On sale', href: '/#offers' },
  { label: 'Track your order', href: '/track' },
  { label: 'Search products', href: '/search' },
]
