import pdf from "@cedrugs/pdf-parse";
import type { PdfParsingResult } from "./types";

const _inFlight = new Map<string, Promise<PdfParsingResult>>();

function fileKey(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function cleanExtractedText(raw: string): string {
  return raw
    .replace(/\r\n|\r/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractTextViaUnpdf(buffer: Buffer): Promise<string> {
  const { extractText } = await import("unpdf");
  const uint8 = new Uint8Array(buffer);
  const { text } = await extractText(uint8, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : (text ?? "");
}

async function _parseBuffer(buffer: Buffer): Promise<PdfParsingResult> {
  const errors: string[] = [];

  // Primary: pdf-parse
  try {
    const data = await pdf(buffer);
    const text = cleanExtractedText(data.text || "");
    return { parser: "pdf-parse", errors, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    console.error("Primary PDF parsing failed; attempting fallback:", error);
  }

  // Fallback: unpdf
  try {
    const raw = await extractTextViaUnpdf(buffer);
    const text = cleanExtractedText(raw);
    return { parser: "pdfjs", errors, text };
  } catch (fallbackError) {
    const fallbackMessage =
      fallbackError instanceof Error
        ? fallbackError.message
        : String(fallbackError);
    errors.push(fallbackMessage);
    console.error("Fallback PDF parsing failed:", fallbackError);
    return { parser: "none", errors, text: "" };
  }
}

export async function extractTextFromPdfBufferWithDiagnostics(
  buffer: Buffer,
): Promise<PdfParsingResult> {
  return _parseBuffer(buffer);
}

export async function extractTextFromPdfBuffer(
  buffer: Buffer,
): Promise<string> {
  const result = await _parseBuffer(buffer);
  return result.text;
}

export async function extractTextFromPDFWithDiagnostics(
  file: File,
): Promise<PdfParsingResult> {
  const key = fileKey(file);

  const existing = _inFlight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<PdfParsingResult> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return await _parseBuffer(buffer);
    } finally {
      _inFlight.delete(key);
    }
  })();

  _inFlight.set(key, promise);
  return promise;
}

export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const result = await extractTextFromPDFWithDiagnostics(file);
    const text = result.text;

    console.log(`PDF parsed — ${text.length} characters extracted`);

    if (text.length < 15) {
      console.warn(
        "Very little text extracted (PDF may be image-based or scanned)",
      );
    }

    return text;
  } catch (error) {
    console.error("PDF parsing failed:", error);
    return "";
  }
}
