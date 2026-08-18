// Declarative description of every editable part of the homepage.
// The editors are generated from this — adding a field here is the only step needed
// to make it editable, as long as index.html has a matching data-cms hook.

export const SCHEMA = [
  {
    id: "brand",
    label: "Logo & Icons",
    blurb: "The logo in the footer and the WhatsApp icon used on the floating button.",
    fields: [
      { key: "footerLogo", label: "Footer logo", type: "media" },
      { key: "whatsappIcon", label: "WhatsApp icon", type: "media" },
    ],
  },
  {
    id: "contact",
    label: "Contact & Buttons",
    blurb: "Your phone number and the wording on the Call / WhatsApp buttons. Changing the number here updates every button on the site at once.",
    fields: [
      { key: "phone", label: "Phone number", type: "text", hint: "Used by the “Call Us” buttons. Include the country code, e.g. +918700322846" },
      { key: "whatsappNumber", label: "WhatsApp number", type: "text", hint: "Digits only, with country code, e.g. 918700322846" },
      { key: "whatsappMessage", label: "Pre-filled WhatsApp message", type: "text", hint: "What gets typed for the customer when they open the chat." },
      { key: "callLabel", label: "“Call” button text", type: "text" },
      { key: "whatsappLabel", label: "“WhatsApp” button text", type: "text" },
      { key: "floatingLabel", label: "Floating chat button text", type: "text" },
    ],
  },
  {
    id: "hero",
    label: "Hero Section",
    blurb: "The first thing visitors see — background image, headline and the enquiry form heading.",
    fields: [
      { key: "heroImage", label: "Background image", type: "media" },
      { key: "brushImage", label: "Brush-stroke decoration", type: "media" },
      { key: "heading", label: "Main headline", type: "textarea" },
      { key: "paragraphPrefix", label: "Intro text (before highlight)", type: "textarea" },
      { key: "highlightText", label: "Highlighted words", type: "textarea" },
      { key: "paragraphSuffix", label: "Intro text (after highlight)", type: "text" },
      { key: "badgeLabel", label: "Badge text", type: "text" },
      { key: "uspList", label: "Key points", type: "list-text", itemLabel: "Point" },
      { key: "formHeading", label: "Enquiry form heading", type: "text" },
      { key: "formLabelName", label: "Form label — name", type: "text" },
      { key: "formLabelPhone", label: "Form label — phone", type: "text" },
      { key: "formLabelEmail", label: "Form label — email", type: "text" },
      { key: "formLabelLocation", label: "Form label — location", type: "text" },
      { key: "formLabelProperty", label: "Form label — property type", type: "text" },
      { key: "formPropertyOptions", label: "Property type choices", type: "list-text", itemLabel: "Choice" },
      { key: "formButtonLabel", label: "Enquiry form button", type: "text" },
    ],
  },
  {
    id: "testimonials",
    label: "Testimonials",
    blurb: "The scrolling customer reviews. They loop automatically, so order matters less than wording.",
    type: "repeater",
    itemLabel: "Review",
    titleKey: "name",
    itemFields: [
      { key: "name", label: "Customer name", type: "text" },
      { key: "text", label: "Review", type: "textarea" },
    ],
    newItem: () => ({ id: `t${Date.now()}`, name: "", text: "" }),
  },
  {
    id: "quotation",
    label: "“Why Replace” Section",
    blurb: "The green band with the repair-vs-replace pitch and a WhatsApp button.",
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "paragraphHtml", label: "Paragraph", type: "html" },
      { key: "ctaLabel", label: "WhatsApp button text", type: "text" },
    ],
  },
  {
    id: "carousel",
    label: "Photo Strip",
    blurb: "The wide sliding strip of photos below the reviews.",
    type: "media-list",
    itemLabel: "Photo",
  },
  {
    id: "tabsSection",
    label: "Service Tabs",
    blurb: "The SOFAS / RECLINERS / CHAIRS / BEDS tabs with a full-screen background photo each.",
    fields: [
      { key: "heading", label: "Section heading", type: "text" },
      { key: "ctaLabel", label: "Button text", type: "text" },
      {
        key: "tabs",
        label: "Tabs",
        type: "repeater",
        itemLabel: "Tab",
        titleKey: "label",
        itemFields: [
          { key: "label", label: "Tab name", type: "text" },
          { key: "key", label: "Internal id", type: "text", hint: "Lowercase, no spaces. Leave alone unless adding a new tab." },
          { key: "visible", label: "Show this tab on the site", type: "checkbox" },
          { key: "bg", label: "Background photo", type: "media" },
          { key: "content", label: "Description", type: "textarea" },
        ],
        newItem: () => ({ key: "", label: "", visible: true, content: "", bg: { url: "", storagePath: null } }),
      },
    ],
  },
  {
    id: "gallery",
    label: "Work Gallery",
    blurb: "The “See Our Work” photo grid. Pick a category to manage its photos.",
    type: "gallery",
  },
  {
    id: "ourStory",
    label: "Our Story",
    blurb: "The about-us copy, the animated counters and the guarantee block.",
    fields: [
      { key: "heading", label: "Heading", type: "text" },
      { key: "paragraph1", label: "First paragraph", type: "textarea" },
      { key: "paragraph2", label: "Second paragraph", type: "textarea" },
      { key: "paragraph3", label: "Lead-in to the list", type: "textarea" },
      { key: "bulletList", label: "Bullet points", type: "list-text", itemLabel: "Point" },
      {
        key: "counters",
        label: "Counters",
        type: "repeater",
        itemLabel: "Counter",
        titleKey: "label",
        itemFields: [
          { key: "label", label: "Caption", type: "text" },
          { key: "target", label: "Number", type: "number" },
          { key: "suffix", label: "Suffix", type: "text", hint: "e.g. + or %" },
        ],
        newItem: () => ({ id: `c${Date.now()}`, label: "", target: 0, suffix: "+" }),
      },
      {
        key: "guarantee",
        label: "Guarantee block",
        type: "group",
        fields: [
          { key: "heading", label: "Heading", type: "text" },
          { key: "paragraphHtml", label: "Paragraph", type: "html" },
        ],
      },
    ],
  },
  {
    id: "mapLocations",
    label: "Locations",
    blurb: "Your shop addresses and their Google Maps embeds.",
    type: "repeater",
    itemLabel: "Location",
    titleKey: "heading",
    itemFields: [
      { key: "heading", label: "Address / caption", type: "textarea" },
      {
        key: "embedSrc",
        label: "Google Maps embed link",
        type: "textarea",
        hint: "In Google Maps: Share → Embed a map → Copy HTML, then paste only the src=\"…\" link from it.",
      },
    ],
    newItem: () => ({ id: `loc${Date.now()}`, heading: "", embedSrc: "" }),
  },
  {
    id: "footer",
    label: "Footer Links",
    blurb: "The links across the footer.",
    fields: [
      {
        key: "links",
        label: "Links",
        type: "repeater",
        itemLabel: "Link",
        titleKey: "label",
        itemFields: [
          { key: "label", label: "Text", type: "text" },
          { key: "href", label: "Destination", type: "text", hint: "A page like policy.html, or an on-page jump like #ourStory" },
        ],
        newItem: () => ({ label: "", href: "" }),
      },
    ],
  },
];

export const SECTION_BY_ID = Object.fromEntries(SCHEMA.map((s) => [s.id, s]));
