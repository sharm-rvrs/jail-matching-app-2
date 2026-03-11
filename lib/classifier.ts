import OpenAI from "openai";
import type { DocumentCategory, DocumentType } from "./types";

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY!,
  baseURL: "https://api.groq.com/openai/v1",
});

const CLASSIFICATION_PROMPT = `
Classify the document below into ONE of the following types.

DOCUMENT TYPES:

1. Booking Summary
   Jail booking record. Key fields: Booking Number, Booking Date/Time,
   Inmate Name, Charges, Arresting Agency, Mugshot.

2. Court Docket Notice
   Court notice for a scheduled hearing. Key fields: Defendant Name,
   Hearing Date, Court, Judge, Appearance Instructions.

3. Crash Report
   Traffic collision report. Key fields: Driver Name, Vehicle Information,
   Accident Narrative, Roadway Details, Injuries.

4. Arrest Report
   Police arrest documentation. Key fields: Arrestee Name, Arrest Date,
   Arresting Officer, Agency, Charges, Case Number.

5. Bond Release Order
   Bail or bond conditions document. Key fields: Defendant Name, Bond Amount,
   Bond Type, Court, Release Conditions.

6. Inmate Transfer Form
   Record of inmate movement between facilities. Key fields: Inmate Name,
   From Facility, To Facility, Transfer Date, Transporting Officer.

7. Warrant of Arrest
   Legal order authorising an arrest. Key fields: Defendant Name,
   Warrant Number, Issuing Judge, Charges, Issue Date.

8. Jail Intake Form
   Initial intake documentation. Key fields: Inmate Name, Date of Birth,
   Booking Number, Medical Screening, Intake Officer.

9. Probation Violation Report
   Probation violation documentation. Key fields: Offender Name,
   Probation Officer, Violation Description, Court Case Number.

10. Other
    Any document that does not match the above types.

CONFIDENCE SCORING:
- 90–100: Very clear match
- 70–89: Strong indicators but not perfect
- 40–69: Weak signals
- 0–39:  Very uncertain — use "Other"

RULES:
- Choose the single best matching type.
- If uncertain, return "Other".
- Return ONLY valid JSON — no markdown, no extra text.

REQUIRED OUTPUT FORMAT:
{
  "type": "<one of the 10 types above>",
  "confidence": <integer 0–100>,
  "explanation": "<one sentence referencing specific fields found in the text>"
}

DOCUMENT TEXT:
"""{{TEXT}}"""
`;

const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "Booking Summary",
  "Court Docket Notice",
  "Crash Report",
  "Arrest Report",
  "Bond Release Order",
  "Inmate Transfer Form",
  "Warrant of Arrest",
  "Jail Intake Form",
  "Probation Violation Report",
  "Other",
];

// Helpers

function isDocumentCategory(value: unknown): value is DocumentCategory {
  return (
    typeof value === "string" &&
    (DOCUMENT_CATEGORIES as readonly string[]).includes(value)
  );
}

// Strips markdown code fences and extracts the first JSON object found.
function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  const jsonString = jsonMatch ? jsonMatch[0] : cleaned;

  return JSON.parse(jsonString);
}

const CLASSIFICATION_TIMEOUT_MS = 15_000; // 15 seconds

export async function classifyDocument(text: string): Promise<DocumentType> {
  try {
    // Wrap the Groq call in a timeout so a slow response doesn't hang the UI.
    const response = await Promise.race([
      openai.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 250,
        messages: [
          {
            role: "system",
            content:
              "You are a law enforcement document classification system. Return only valid JSON.",
          },
          {
            role: "user",
            content: CLASSIFICATION_PROMPT.replace(
              "{{TEXT}}",
              text.slice(0, 7000),
            ),
          },
        ],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Classification request timed out")),
          CLASSIFICATION_TIMEOUT_MS,
        ),
      ),
    ]);

    const rawContent = response.choices[0]?.message?.content || "";
    console.log(
      "Raw classification response:",
      rawContent.substring(0, 200) + "...",
    );

    const parsed = extractJson(rawContent);

    const obj =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};

    const rawType = obj.type;
    const type: DocumentCategory = isDocumentCategory(rawType)
      ? rawType
      : "Other";

    const rawConfidence = obj.confidence;
    const confidence = Math.min(
      100,
      Math.max(
        0,
        typeof rawConfidence === "number"
          ? rawConfidence
          : Number(rawConfidence) || 30,
      ),
    );

    const explanation =
      typeof obj.explanation === "string" && obj.explanation.trim().length > 0
        ? obj.explanation
        : "No explanation provided";

    return { type, confidence, explanation };
  } catch (error) {
    console.error("Classification failed:", error);
    return {
      type: "Other",
      confidence: 30,
      explanation:
        error instanceof Error && error.message.includes("timed out")
          ? "Classification timed out — defaulting to Other"
          : "Classification failed — defaulting to Other",
    };
  }
}
