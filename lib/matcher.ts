import roster from "@/data/roster.json";
import fs from "fs";
import path from "path";
import type { MatchResult, RosterEntry } from "./types";

// Helpers
function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

function normalizeComparable(name: string): string {
  return normalize(name).replace(/[^a-z\s]/g, "");
}

// Tokenise: strips ALL punctuation including commas before splitting 
function getTokens(name: string): string[] {
  return normalize(name)
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}


// Parse a name string into its structural parts.
function parseName(raw: string): {
  lastName: string;
  firstName: string;
  middleTokens: string[];
  allTokens: string[];
} {
  const tokens = getTokens(raw);
  const hasComma = raw.includes(",");

  const lastName = hasComma
    ? (tokens[0] ?? "")
    : (tokens[tokens.length - 1] ?? "");
  const firstName = hasComma ? (tokens[1] ?? "") : (tokens[0] ?? "");
  const middleTokens = tokens.filter((t) => t !== lastName && t !== firstName);

  return { lastName, firstName, middleTokens, allTokens: tokens };
}

// Scoring
function calculateNameScore(
  extracted: string,
  rosterName: string,
): { score: number; type: MatchResult["matchType"] } {
  const ext = parseName(extracted);
  const ros = parseName(rosterName);

  if (ext.allTokens.length === 0 || ros.allTokens.length === 0)
    return { score: 0, type: "partial" };

  // Exact match (punctuation-insensitive)
  if (normalizeComparable(extracted) === normalizeComparable(rosterName)) {
    return { score: 100, type: "exact" };
  }

  const intersection = ext.allTokens.filter((t) =>
    ros.allTokens.includes(t),
  ).length;
  const union = new Set([...ext.allTokens, ...ros.allTokens]).size;
  let score = Math.round((intersection / union) * 70);

  // Guard 1: roster last name must not be a middle token of the extracted name
  if (ros.lastName && ext.middleTokens.includes(ros.lastName)) {
    return { score: 0, type: "partial" };
  }

  // Guard 2: roster first name must not be a middle token of the extracted name
  if (ros.firstName && ext.middleTokens.includes(ros.firstName)) {
    return { score: 0, type: "partial" };
  }

  const lastNameMatch = !!ros.lastName && ros.lastName === ext.lastName;
  const firstNameMatch = !!ros.firstName && ros.firstName === ext.firstName;

  // Guard 3: last name must align
  if (!lastNameMatch) return { score: 0, type: "partial" };

  if (ext.allTokens.length >= 4 && !firstNameMatch) {
    return { score: 0, type: "partial" };
  }

  // Guard 5: short names still need first-name OR second token overlap
  if (intersection < 2 && !firstNameMatch) return { score: 0, type: "partial" };

  if (lastNameMatch) score += 25;
  if (firstNameMatch) score += 15;

  // Bonus: all extracted tokens present in roster tokens
  if (ext.allTokens.every((t) => ros.allTokens.includes(t))) score += 10;

  const finalScore = Math.min(98, Math.max(0, score));
  const type = finalScore > 85 ? "strong" : "partial";

  return { score: finalScore, type };
}

export function matchNames(extractedNames: string[]): MatchResult[] {
  const matches: MatchResult[] = [];
  const rosterEntries = roster as unknown as RosterEntry[];

  for (const name of extractedNames) {
    if (matches.some((m) => m.extractedName === name)) continue;

    let bestScore = 0;
    let bestMatch: RosterEntry | null = null;

    for (const r of rosterEntries) {
      const { score } = calculateNameScore(name, r.name);
      if (score > bestScore && score >= 65) {
        bestScore = score;
        bestMatch = r;
      }
    }

    if (bestMatch !== null) {
      const matched = bestMatch;
      if (matches.some((m) => m.rosterName === matched.name)) continue;

      const { score, type } = calculateNameScore(name, matched.name);
      matches.push({
        extractedName: name,
        rosterName: matched.name,
        jail: matched.jailSource,
        photo: matched.photoUrl,
        confidence: score,
        matchType: type,
      });
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

export function saveMatches(matches: MatchResult[]) {
  const filePath = path.join(process.cwd(), "data", "matches.json");
  const data = {
    timestamp: new Date().toISOString(),
    totalMatches: matches.length,
    matches,
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}
