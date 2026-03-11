import { normalizeName } from "./nameUtils";
import type { NameCandidate, CandidateSource } from "./types";

// Words that are never part of a person's name.
const JUNK_WORDS = new Set([
  // Police / report vocabulary
  "COUNTY",
  "ROAD",
  "RD",
  "COURT",
  "AGENCY",
  "WEATHER",
  "SURFACE",
  "TRAFFIC",
  "CONTROL",
  "SIGN",
  "STOP",
  "LIGHT",
  "VEHICLE",
  "PASSENGER",
  "WITNESS",
  "TIME",
  "DATE",
  "LOCATION",
  "BOND",
  "OFFICER",
  "REPORT",
  "STATUTE",
  "NOTES",
  "NARRATIVE",
  "STATEMENT",
  "PROVIDED",
  "ON-SCENE",
  "SCENE",
  "UPDATED",
  "NAMES",
  "MATCHING",
  "BOOKING",
  "SUMMARY",
  "NOTICE",
  "CHARGE",
  "DESCRIPTION",
  "VIOLATION",
  "INSTRUCTIONS",
  "ORDERED",
  "APPEAR",
  "REPRESENTED",
  "ATTORNEY",
  "CERTIFY",
  "SERVED",
  "TAKE",
  "HOME",
  "WORKING",
  "INTERVIEW",
  "COUNSEL",
  "ROSTER",
  "PAGE",
  "ARRESTING",
  "DISPOSITION",
  "HOLDS",
  "SUBJECT",
  "INFORMATION",
  "CHARGES",
  "CONTEMPT",
  "HEARING",
  "DRIVER",
  "INFO",
  "INJURY",
  "YIELD",
  "CODE",
  // Form field labels
  "SEX",
  "RACE",
  "AGE",
  "WAS",
  "BOOKED",
  // Single-letter tokens that slip through
  "M",
  "W",
  "N",
]);

// Location/brand words that should be blocked only when they appear in an address or vehicle context
const LOCATION_WORDS = new Set([
  "MADISON",
  "HUNTSVILLE",
  "PIKE",
  "OLD",
  "TOYOTA",
  "CAMRY",
  "ON-SCENE",
]);

const SUFFIX_WORDS = new Set(["JR", "SR", "II", "III", "IV", "V"]);

function splitStuckNames(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, "$1 $2")
    .replace(/([A-Za-z'-]{2,})(DOB|D\.O\.B\.|BIRTH|FAILURE)\b/g, "$1 $2");
}

// Candidate cleaning
function cleanCandidate(name: string): string {
  let cleaned = name
    .replace(/\b(DOB|D\.O\.B\.|BIRTH)\b/gi, " ")
    .replace(/\bFailure\b/gi, " ")
    .replace(/[,/\\|]+/g, " ")
    .replace(/\./g, " ")
    .replace(/[^A-Za-z\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Strip leading role / title prefixes
  cleaned = cleaned.replace(
    /^(Name|Defendant|Subject|Driver|Witness|Judge)\s*/i,
    "",
  );

  // Suffixes that end up at the front due to "JR SMITH" ordering in some forms
  cleaned = cleaned.replace(/^(Jr|Sr)\s+/i, "");

  // Strip trailing suffixes
  cleaned = cleaned.replace(/\s+(Jr|Sr|II|III|IV|V)$/i, "").trim();

  // Strip trailing filler words that bleed in from surrounding text
  cleaned = cleaned.replace(
    /\s+(Age|was booked|Subject|Information|on|for|this|and|the|of)$/i,
    "",
  );

  return cleaned;
}

// Name Validation
/**
 * Rules:
 *  - 2–6 tokens total
 *  - At least 2 "real" words (length ≥ 2, not a junk/location word)
 *  - At most 2 single-letter initials
 *  - Each real word must consist solely of letters, hyphens, or apostrophes
 *
 * Location words are only blocked when the candidate contains ≥ 2 other
 * location/address tokens, preventing surnames like "Madison" from being
 * dropped when they appear in a name context.
 */
function looksLikeName(name: string): boolean {
  const words = name
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  if (words.length < 2 || words.length > 6) return false;

  let longWordCount = 0;
  let initialCount = 0;
  let locationWordCount = 0;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const upper = w.toUpperCase();

    // Trailing name suffix is always allowed
    if (i === words.length - 1 && SUFFIX_WORDS.has(upper)) continue;

    // Single-letter middle initial
    if (w.length === 1 && /^[A-Za-z]$/.test(w)) {
      initialCount++;
      continue;
    }

    if (w.length >= 2) {
      if (JUNK_WORDS.has(upper)) return false;

      if (LOCATION_WORDS.has(upper)) {
        locationWordCount++;
        // If the majority of tokens are location words it's an address, not a name
        if (locationWordCount >= 2) return false;
        // Otherwise, allow it — it might be a surname
        longWordCount++;
        continue;
      }

      if (!/^[A-Za-z][A-Za-z'-]*[A-Za-z]$/.test(w)) return false;
      longWordCount++;
      continue;
    }

    return false;
  }

  if (longWordCount < 2) return false;
  if (initialCount > 2) return false;

  return true;
}

// Scoring
function scoreCandidate(source: CandidateSource, cleaned: string): number {
  const SOURCE_SCORES: Record<CandidateSource, number> = {
    keyValue: 80,
    label: 70,
    comma: 55,
    caps: 35,
    title: 25,
  };

  let score = SOURCE_SCORES[source];

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 2) score += 10;
  else if (words.length === 3) score += 15;
  else if (words.length >= 4) score += 12;

  if (words.some((w) => w.length === 1)) score -= 4;

  return score;
}

// Candidate merging
function mergeCandidate(
  map: Map<string, NameCandidate>,
  raw: string,
  source: CandidateSource,
): void {
  const stuck = splitStuckNames(raw);
  const candidate = cleanCandidate(stuck);
  if (!candidate || !looksLikeName(candidate)) return;

  const normalized = normalizeName(candidate);
  if (!normalized) return;

  const next: NameCandidate = {
    raw,
    cleaned: candidate,
    normalized,
    score: scoreCandidate(source, candidate),
    source,
  };

  const existing = map.get(normalized);
  if (!existing || next.score > existing.score) {
    map.set(normalized, next);
  }
}

// Main extraction
export function extractPotentialNames(text: string, debug = false): string[] {
  const byNormalized = new Map<string, NameCandidate>();

  const preprocessed = splitStuckNames(text);
  const cleanText = preprocessed.replace(/\s+/g, " ");

  // 1. Key-value form fields: LAST NAME / FIRST NAME / MI
  const kvRegex =
    /\bLAST\s*NAME\b\s*[:#-]?\s*([A-Z][A-Za-z'-]{1,30})\b[\s\S]{0,200}?\bFIRST\s*NAME\b\s*[:#-]?\s*([A-Z][A-Za-z'-]{1,30})\b(?:[\s\S]{0,60}?\b(?:MI|MIDDLE\s*INITIAL|M\.?I\.?)\b\s*[:#-]?\s*([A-Z]))?/gi;

  let kv;
  while ((kv = kvRegex.exec(preprocessed)) !== null) {
    const last = kv[1];
    const first = kv[2];
    const mi = kv[3];
    const combined = mi ? `${last} ${first} ${mi}` : `${last} ${first}`;
    mergeCandidate(byNormalized, combined, "keyValue");
  }

  // 2. Standard name patterns
  const patternRegexes: RegExp[] = [
    // "Last, First [Middle]" — comma-separated roster format
    /\b[A-Z][A-Za-z'-]{1,30}\s*,\s*[A-Z][A-Za-z'-]{1,30}(?:\s+[A-Z][A-Za-z'-]{1,30}){0,3}\b/g,
    // Title-case / mixed-case multi-word sequences
    /\b[A-Z][A-Za-z'-]{2,}(?:\s+[A-Z][A-Za-z'-]{2,}){1,4}\b/g,
    // ALL-CAPS sequences (common in roster exports and legal docs)
    /\b[A-Z]{2,}(?:\s+[A-Z]{2,}){1,4}\b/g,
  ];

  for (const regex of patternRegexes) {
    let match;
    while ((match = regex.exec(cleanText)) !== null) {
      const raw = match[0];
      const source: CandidateSource = raw.includes(",")
        ? "comma"
        : /^[A-Z\s'-]+$/.test(raw)
          ? "caps"
          : "title";

      mergeCandidate(byNormalized, raw, source);
    }
  }

  // 3. Label-anchored patterns
  const labelPatterns: RegExp[] = [
    /\b(?:Inmate\s+Name|Arrestee\s+Name|Subject\s+Name|Defendant\s+Name|NAME|Name)\b\s*[:#-]?\s*([A-Z][A-Za-z\s',-]{3,60}?)(?=\n|$|\s{2,})/gi,
    /\bDefendant\b\s*[:#-]?\s*([A-Z][A-Za-z\s',-]{3,60}?)(?=\n|$|\s{2,})/gi,
    /\bJudge\b\s*[:#-]?\s*(?:Hon\.?\s*)?([A-Z][A-Za-z\s',-]{3,60}?)(?=\n|$|\s{2,})/gi,
    /\bSubject\b\s*[:#-]?\s*([A-Z][A-Za-z\s',-]{3,60}?)(?=\n|$|\s{2,})/gi,
  ];

  for (const regex of labelPatterns) {
    let m;
    while ((m = regex.exec(preprocessed)) !== null) {
      mergeCandidate(byNormalized, m[1] ?? m[0], "label");
    }
  }

  // Sort by descending score
  const candidates = Array.from(byNormalized.values()).sort(
    (a, b) => b.score - a.score,
  );

  if (debug) {
    console.debug(
      `[nameExtractor] ${candidates.length} candidates found:`,
      candidates
        .slice(0, 20)
        .map((c) => `${c.cleaned} (${c.source}:${c.score})`),
    );
  }

  console.log(
    `Extracted ${candidates.length} potential names`,
    candidates.slice(0, 20).map((c) => `${c.cleaned} (${c.source}:${c.score})`),
  );

  return candidates.map((c) => c.cleaned);
}

export function extractAndNormalizeNames(
  text: string,
  debug = false,
): Array<{ raw: string; normalized: string }> {
  const rawNames = extractPotentialNames(text, debug);

  const results = rawNames.map((raw) => ({
    raw,
    normalized: normalizeName(raw),
  }));

  console.log(
    `Normalized ${results.length} names`,
    results.map((n) => n.normalized),
  );

  if (debug) {
    console.debug(
      `[nameExtractor] ${results.length} normalized:`,
      results.map((n) => n.normalized),
    );
  }

  return results;
}
