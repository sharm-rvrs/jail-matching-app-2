export type JailSource = "Madison" | "Limestone";

// Scraper
export type ScrapedInmate = {
  name: string;
  photoUrl: string | null;
};

// Roster
export interface RosterEntry {
  id: string;
  name: string;
  normalizedName?: string;
  photoUrl: string;
  jailSource: JailSource;
}

// Matching
export interface MatchResult {
  extractedName: string;
  rosterName: string;
  jail: JailSource;
  photo: string;
  confidence: number;
  matchType: "exact" | "strong" | "partial";
}

// Document classification
export type DocumentCategory =
  | "Booking Summary"
  | "Court Docket Notice"
  | "Crash Report"
  | "Arrest Report"
  | "Bond Release Order"
  | "Inmate Transfer Form"
  | "Warrant of Arrest"
  | "Jail Intake Form"
  | "Probation Violation Report"
  | "Other";

export interface DocumentType {
  type: DocumentCategory;
  confidence: number;
  explanation: string;
}

// PDF parsing
export type PdfParsingDiagnostics = {
  parser: "pdf-parse" | "pdfjs" | "none";
  errors: string[];
};

export type PdfParsingResult = PdfParsingDiagnostics & {
  text: string;
};

// API
export interface ApiResponse {
  success: boolean;
  filename: string;
  pdfParsing?: PdfParsingDiagnostics;
  textLength: number;
  extractedText: string;
  extractedNames: Array<{ raw: string; normalized: string }>;
  totalNamesFound: number;
  matches: MatchResult[];
  totalMatches: number;
  documentType: DocumentType;
  processedAt?: string;
}

// Name Extractor
export type CandidateSource = "label" | "keyValue" | "comma" | "caps" | "title";

export type NameCandidate = {
  raw: string;
  cleaned: string;
  normalized: string;
  score: number;
  source: CandidateSource;
};
