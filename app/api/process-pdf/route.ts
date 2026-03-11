import { NextRequest, NextResponse } from "next/server";
import { extractTextFromPDFWithDiagnostics } from "@/lib/pdfParser";
import { extractAndNormalizeNames } from "@/lib/nameExtractor";
import { matchNames, saveMatches } from "@/lib/matcher";
import { classifyDocument } from "@/lib/classifier";
import type { DocumentType } from "@/lib/types";
import { sendMatchEmail } from "@/lib/email";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        { error: "Only PDF files are allowed" },
        { status: 400 },
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "PDF too large (max 10MB)" },
        { status: 400 },
      );
    }

    console.log(
      `Processing PDF: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
    );

    // Core Pipeline
    const parsed = await extractTextFromPDFWithDiagnostics(file);
    const text = parsed.text;

    if (!text || text.length < 20) {
      console.warn("Very little text extracted from PDF");
    }

    console.log(`Extracted text length: ${text.length} chars`);

    // Extract & normalize names
    const namesWithNormalized = extractAndNormalizeNames(text);

    const seen = new Set<string>();
    const uniqueRawNames: string[] = [];
    for (const { raw, normalized } of namesWithNormalized) {
      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueRawNames.push(raw);
      }
    }

    console.log(`Extracted ${namesWithNormalized.length} potential names`);

    // Match against roster using original casing
    const matches = matchNames(uniqueRawNames);
    console.log(`Matches found: ${matches.length}`);

    saveMatches(matches);

    // Classify document type
    const classification: DocumentType = await classifyDocument(text);
    console.log(
      `Classified as: ${classification.type} (${classification.confidence}%)`,
    );

    // Send email notification (only if matches exist)
    if (matches.length > 0) {
      await sendMatchEmail(matches, file.name, classification.type);
    }

    return NextResponse.json({
      success: true,
      filename: file.name,
      pdfParsing: {
        parser: parsed.parser,
        errors: parsed.errors,
      },
      textLength: text.length,
      extractedText: text,
      extractedNames: namesWithNormalized,
      totalNamesFound: namesWithNormalized.length,
      matches,
      totalMatches: matches.length,
      documentType: classification,
      processedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Process PDF error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Processing failed",
      },
      { status: 500 },
    );
  }
}
