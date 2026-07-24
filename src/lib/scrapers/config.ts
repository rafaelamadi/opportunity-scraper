/**
 * Shared configuration for all scrapers
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// HTTP request configuration
export const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
};

export const REQUEST_TIMEOUT = 10000; // 10 seconds
export const REQUEST_DELAY = 500; // 500ms between requests
export const INSERT_DELAY = 500; // 500ms between DB inserts

// ICT/Software related keywords for filtering
export const ICT_KEYWORDS = [
  "software",
  "ict",
  "digital",
  "it system",
  "software system",
  "platform",
  "database",
  "app",
  "application",
  "e-learning",
  "e-government",
  "automation",
  "website",
  "portal",
  "data management",
  "digitization",
  "cloud",
  "api",
  "web",
  "programming",
  "software development",
  "app development",
  "web development",
  "it infrastructure",
  "cybersecurity",
];

// Source metadata
export const SOURCES = {
  etenders: {
    name: "etenders.com.ng",
    url: "https://etenders.com.ng",
    type: "WordPress API",
    category_id: 56, // ICT and Software (legacy single-category, kept for reference)
    requires_keyword_filter: false,
    // Multi-category scrape: tech categories + broad opportunity types (consultancy, grants, NGO).
    // Map of WordPress category ID -> readable name (stored as the opportunity's `category`).
    // IDs verified against etenders.com.ng/wp-json/wp/v2/categories.
    categories: {
      56: "ICT and Software",
      52: "Computer Hardware",
      33975: "Data and Digital",
      32796: "Internet Facilities",
      5546: "Telecommunication",
      70: "Media & Design",
      59: "Consultancy",
      7993: "Grant Opportunities",
      33962: "NGO",
      32959: "Business Opp.",
    } as Record<number, string>,
  },
  tender_ng: {
    name: "tender.ng",
    url: "https://tender.ng",
    type: "HTML Parsing",
    category_id: 24, // ICT category
    requires_keyword_filter: false,
  },
  nigeriatenders: {
    name: "nigeriatenders.com",
    url: "https://www.nigeriatenders.com",
    type: "HTML Parsing",
    category: "IT",
    requires_keyword_filter: false,
  },
  thisday: {
    name: "thisdaylive.com",
    url: "https://www.thisdaylive.com",
    type: "WordPress API",
    category_id: 7568, // Business (site's own tag/search filtering is broken, so we
    // pre-filter to this category, then apply our own ICT_KEYWORDS match)
    requires_keyword_filter: true,
  },
  vanguard: {
    name: "vanguardngr.com",
    url: "https://www.vanguardngr.com",
    type: "RSS Feed",
    feed_url: "https://www.vanguardngr.com/category/business/feed/",
    requires_keyword_filter: true,
  },
};
