export interface BrandingConfig {
  readonly companyName: string;
  readonly productName: string;
  readonly shortProductName: string;
  readonly tagline: string;
  readonly productPromise: string;
  readonly shortDescription: string;
  readonly supportEmail: string;
  readonly salesEmail: string;
  readonly websiteUrl: string;
  readonly copyrightOwner: string;
  readonly logoText: string;
  readonly legalName: string;
  readonly socialProfiles: {
    readonly facebook: string;
    readonly instagram: string;
    readonly linkedin: string;
    readonly x: string;
  };
  readonly defaultPageTitle: string;
  readonly titleTemplate: string;
  readonly defaultMetaDescription: string;
}

export const branding = {
  companyName: "AI Receptionist Company",
  productName: "AI Receptionist Platform",
  shortProductName: "Receptionist",
  tagline: "Never miss another customer.",
  productPromise: "Your business is always open, even when you are not.",
  shortDescription:
    "An AI receptionist that helps small businesses capture customer inquiries.",
  supportEmail: "support@example.com",
  salesEmail: "sales@example.com",
  websiteUrl: "https://example.com",
  copyrightOwner: "AI Receptionist Company",
  logoText: "AI Receptionist",
  legalName: "AI Receptionist Company",
  socialProfiles: {
    facebook: "",
    instagram: "",
    linkedin: "",
    x: "",
  },
  defaultPageTitle: "AI Receptionist Platform",
  titleTemplate: "%s | AI Receptionist Platform",
  defaultMetaDescription:
    "Help your small business capture customer inquiries through an AI receptionist.",
} as const satisfies BrandingConfig;
