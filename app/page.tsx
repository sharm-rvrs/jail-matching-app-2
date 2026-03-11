"use client";

import { useState, useRef, useMemo } from "react";
import {
  Container,
  Title,
  Text,
  Button,
  Card,
  Image,
  Badge,
  Alert,
  Loader,
  Group,
  Stack,
  Paper,
  Grid,
  Progress,
} from "@mantine/core";

import { Dropzone, FileWithPath } from "@mantine/dropzone";
import {
  IconUpload,
  IconFileText,
  IconSearch,
  IconBrain,
  IconTrash,
} from "@tabler/icons-react";

import type { ApiResponse, MatchResult } from "@/lib/types";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHighlightTerms(matches: MatchResult[]): string[] {
  const terms = new Set<string>();

  const dropTrailingSingleLetter = (value: string) =>
    value.replace(/\s+[A-Za-z]$/g, "");

  for (const match of matches) {
    const roster = (match.rosterName || "").trim();
    const extracted = (match.extractedName || "").trim();

    if (extracted) {
      terms.add(extracted);
    }

    if (!roster) continue;

    terms.add(roster);
    terms.add(roster.replace(/,/g, ""));
    terms.add(dropTrailingSingleLetter(roster));
    terms.add(dropTrailingSingleLetter(roster.replace(/,/g, "")));

    // If format is "LAST, FIRST M", also add "FIRST M LAST"
    if (roster.includes(",")) {
      const [last, rest] = roster.split(",", 2);
      const swapped = `${(rest || "").trim()} ${(last || "").trim()}`.trim();
      if (swapped.length) {
        terms.add(swapped);
        terms.add(dropTrailingSingleLetter(swapped));
      }
    }
  }

  return Array.from(terms)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 3)
    .sort((a, b) => b.length - a.length);
}

function renderHighlightedText(text: string, terms: string[]) {
  if (!text) return null;
  if (!terms || terms.length === 0) return text;

  const escaped = terms.map(escapeRegExp);
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark
        key={index}
        style={{
          background: "#ffe066",
          padding: "2px 4px",
          borderRadius: 4,
          fontWeight: 600,
        }}
      >
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);

  const pdfUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  const handleDrop = (files: FileWithPath[]) => {
    setFile(files[0]);
    setError(null);
    setResult(null);
  };

  const clearAll = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  const processPDF = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/process-pdf", {
        method: "POST",
        body: formData,
      });

      const data: ApiResponse = await res.json();

      if (!data.success) throw new Error("Processing failed");

      setResult(data);

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const highlightTerms = useMemo(() => {
    if (!result?.matches?.length) return [];
    return buildHighlightTerms(result.matches);
  }, [result?.matches]);

  return (
    <Container size="xl" py={40}>
      <Stack align="center" mb={50}>
        <Group>
          <IconBrain size={36} />
          <Title order={1}>Jail Roster Analyzer</Title>
        </Group>

        <Text c="dimmed" ta="center" maw={600}>
          Upload a PDF document and the system will extract inmate names,
          classify the document type, and match records against the jail roster
          database.
        </Text>
      </Stack>

      {/* UPLOAD */}
      <Paper
        radius="xl"
        p="xl"
        shadow="sm"
        style={{
          border: "2px dashed #dee2e6",
          background: "#fafafa",
        }}
      >
        <Dropzone
          onDrop={handleDrop}
          accept={["application/pdf"]}
          maxSize={10 * 1024 * 1024}
        >
          <Stack align="center" py={40}>
            <IconUpload size={56} />

            <Title order={3}>Upload PDF</Title>

            <Text c="dimmed" ta="center">
              Drag and drop your document here or click to browse
            </Text>

            <Text size="xs" c="dimmed">
              Supported format: PDF • Max size 10MB
            </Text>

            {file && (
              <Badge mt="md" size="lg" leftSection={<IconFileText size={14} />}>
                {file.name}
              </Badge>
            )}
          </Stack>
        </Dropzone>
        {/* Upload PDF */}
        {file && (
          <Stack mt="lg">
            <Group justify="space-between">
              <Badge size="lg" leftSection={<IconFileText size={14} />}>
                {file.name}
              </Badge>

              <Button
                size="xs"
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={14} />}
                onClick={clearAll}
              >
                Clear
              </Button>
            </Group>

            <Button
              size="lg"
              fullWidth
              onClick={processPDF}
              loading={loading}
              leftSection={<IconSearch size={18} />}
            >
              Analyze Document
            </Button>
          </Stack>
        )}
      </Paper>

      {/* LOADING */}
      {loading && (
        <Card shadow="sm" p="xl" ta="center" mt="xl">
          <Loader size="lg" mb="md" />
          <Text>Analyzing document...</Text>
        </Card>
      )}

      {/* ERROR */}
      {error && (
        <Alert color="red" title="Error" mt="xl">
          {error}
        </Alert>
      )}

      {/* RESULTS */}
      {result && (
        <Grid mt={50} ref={resultRef}>
          {/* LEFT PANEL */}
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Stack>
              {/* EXTRACTED TEXT */}
              <Card shadow="md" radius="lg" p="lg">
                <Title order={4} mb="sm">
                  Extracted Text
                </Title>

                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 14,
                    lineHeight: 1.6,
                    maxHeight: 600,
                    overflowY: "auto",
                    padding: 16,
                    background: "#f1f3f5",
                    borderRadius: 8,
                  }}
                >
                  {renderHighlightedText(result.extractedText, highlightTerms)}
                </div>
              </Card>

              {/* PDF PREVIEW */}
              {pdfUrl && (
                <Card shadow="md" radius="lg" p="lg">
                  <Title order={4} mb="sm">
                    PDF Preview
                  </Title>

                  <iframe
                    src={pdfUrl}
                    width="100%"
                    height="500px"
                    style={{
                      border: "none",
                      borderRadius: "8px",
                    }}
                  />
                </Card>
              )}
            </Stack>
          </Grid.Col>

          {/* RIGHT PANEL */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Stack>
              {/* CLASSIFIER */}
              <Card shadow="md" radius="lg" p="lg">
                <Group mb="sm">
                  <IconBrain size={20} />
                  <Title order={4}>AI Document Classification</Title>
                </Group>

                <Badge size="lg" color="blue">
                  {result.documentType.type}
                </Badge>

                <Text mt="sm" size="sm">
                  Confidence: {result.documentType.confidence}%
                </Text>

                <Progress
                  mt="xs"
                  value={result.documentType.confidence}
                  size="lg"
                  radius="xl"
                />

                <Text mt="sm" size="sm" c="dimmed">
                  {result.documentType.explanation}
                </Text>
              </Card>

              {/* MATCHES */}
              <Card shadow="md" radius="lg" p="lg">
                <Title order={4} mb="md">
                  Matched Inmates ({result.totalMatches})
                </Title>

                <Stack gap="sm">
                  {result.matches.length === 0 && (
                    <Text c="dimmed">No matches found</Text>
                  )}

                  {result.matches.map((match, index) => (
                    <Card key={index} withBorder padding="sm" radius="md">
                      <Group justify="space-between">
                        <Group>
                          <div
                            style={{
                              width: 60,
                              height: 60,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "#f1f3f5",
                              borderRadius: 8,
                              overflow: "hidden",
                            }}
                          >
                            <Image
                              src={match.photo}
                              width={50}
                              height={50}
                              fit="contain"
                              fallbackSrc="https://placehold.co/50x50"
                            />
                          </div>

                          <div>
                            <Text fw={600} size="sm">
                              {match.rosterName}
                            </Text>

                            <Text size="xs" c="dimmed">
                              {match.jail}
                            </Text>

                            <Badge size="xs" mt={4}>
                              {match.matchType}
                            </Badge>
                          </div>
                        </Group>

                        <Stack gap={2} align="end">
                          <Text size="sm">{match.confidence}%</Text>

                          <Progress
                            value={match.confidence}
                            w={80}
                            size="xs"
                            color={
                              match.confidence > 85
                                ? "green"
                                : match.confidence > 60
                                  ? "yellow"
                                  : "red"
                            }
                          />
                        </Stack>
                      </Group>
                    </Card>
                  ))}
                </Stack>
              </Card>
            </Stack>
          </Grid.Col>
        </Grid>
      )}
    </Container>
  );
}
