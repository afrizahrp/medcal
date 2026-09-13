/**
 * Template-specific page composition. Not a global “every LK is 3 pages” rule.
 * Coordinates are never stored here — only which sections belong on which
 * template page, and which edges are forced page breaks.
 */

export type LkSectionId = string;

export type LkPageCompositionDefinition = {
  templateKey: string;
  pages: Array<{
    page: number;
    sections: LkSectionId[];
  }>;
};
