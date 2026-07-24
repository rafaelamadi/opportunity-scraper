import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "Opportunity Scraper",
  version: packageJson.version,
  copyright: `© ${currentYear}, Opportunity Scraper.`,
  meta: {
    title: "Opportunity Scraper",
    description:
      "Tracks tenders, grants, and funding opportunities scraped daily from multiple sources.",
  },
};
