export interface CatalogItem {
  id: string;
  title: string;
  subtitle?: string;
  streamUrl?: string;
  logoUrl?: string | null;
  groupTitle?: string | null;
}

export interface CatalogSection {
  id: string;
  eyebrow: string;
  title: string;
  showSeeAll?: boolean;
  items: CatalogItem[];
}
