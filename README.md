# PDF Inmate Matching System

## Overview

The **PDF Inmate Matching System** is a web application that processes uploaded PDF documents, extracts names from the document text, and matches them against inmate records scraped from public jail rosters.

The system highlights matched names in the document view, displays the corresponding inmate photo, classifies the document type using an LLM, and optionally sends email notifications when matches are detected.

This project demonstrates a complete pipeline involving:

- Web scraping with Playwright
- PDF document processing
- Name extraction and matching
- Document classification using an LLM (Groq API, OpenAI-compatible)
- Web interface for reviewing results
- Email notifications via Gmail

---

## Architecture Diagram

```
flowchart TD

A[Madison County Jail Roster] --> B[Web Scraper]
C[Limestone County Jail Roster] --> B

B --> D[Normalized Roster JSON]

E[PDF Upload] --> F[PDF Text Extraction]
F --> G[Name Extraction]
G --> H[Name Matching]

D --> H

F --> J[Document Classification LLM]
J --> H

H --> K[Web Application UI]
H --> L[Email Notification System]
```

> Email notifications and classification run asynchronously with matching results. The system uses JSON files for storage and keeps the architecture lightweight and extensible.

---

## Features

- Scrape inmate roster data from multiple county websites
- Extract inmate names and photos
- Upload and process PDF documents
- Extract text from PDFs
- Identify potential names in documents
- Match extracted names with jail roster entries
- Highlight matched names in the document viewer
- Display inmate photos alongside matches
- Classify document templates using an LLM
- Send email notifications when matches are found

---

## Technology Stack

| Layer               | Technology                                   |
| ------------------- | -------------------------------------------- |
| Frontend / Web App  | Next.js (App Router), TypeScript, Mantine UI |
| Web Scraping        | Playwright                                   |
| PDF Processing      | pdf-parse                                    |
| Name Matching       | Custom JavaScript + optional fuzzy matching  |
| Email Notifications | Nodemailer + Gmail App Password              |
| LLM Classification  | Groq API (OpenAI-compatible)                 |
| Storage             | JSON files                                   |

---

## Project Structure

```
jail-matching-app/

app/
  api/
    process-pdf/
      route.ts
  layout.tsx
  page.tsx

lib/
  classifier.ts
  email.ts
  matcher.ts
  nameExtractor.ts
  nameUtils.ts
  pdfParser.ts
  scraper.ts
  types.ts

data/
  roster.json
  matches.json

scripts/
  run-scraper.ts
  debug-extract.ts

.env.example
README.md
package.json
```

---

## Setup Instructions

### 1. Clone the Repository

```bash
git clone <repository-url>
cd jail-matching-app
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Example `.env` configuration:

```
GROQ_API_KEY=your_api_key_here

GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-16-digit-app-password
NOTIFY_EMAIL=recipient@gmail.com
```

---

## Required Environment Variables

| Variable             | Description                                              |
| -------------------- | -------------------------------------------------------- |
| `GROQ_API_KEY`       | API key for Groq (used for document classification)      |
| `GMAIL_USER`         | Gmail address used to send notifications                 |
| `GMAIL_APP_PASSWORD` | Gmail App Password (16-digit, not your account password) |
| `NOTIFY_EMAIL`       | Email recipient for match alerts                         |

> **Note:** Never commit your `.env` file to the repository. A `.env.example` with placeholder values is included.

---

## Running the Scraper

Before processing PDFs, run the scraper to collect current jail roster data:

```bash
npm run scraper
```

This generates `/data/roster.json` — a normalized list of inmate records used for name matching.

> The scraper uses **Playwright** to handle dynamic, JavaScript-rendered roster pages that cannot be fetched with a simple HTTP request.

---

## Running the Web Application

Start the development server:

```bash
npm run dev
```

The application will be available at:

```
http://localhost:3000
```

---

## Processing a PDF

1. Open the web application at `http://localhost:3000`
2. Upload a PDF document
3. Click **Process**
4. The system will:
   - Extract text from the PDF
   - Extract potential names
   - Match names against jail rosters
   - Classify the document type
   - Display results in the interface with highlighted matches and photos

---

## Email Notifications

The system sends an email alert when a name match is detected.

**Setup steps:**

1. Enable **2-Factor Authentication** on your Gmail account
2. Go to **Google Account → Security → App Passwords**
3. Generate a new App Password (16 digits)
4. Add the credentials to your `.env` file

**Each alert email includes:**

- Matched inmate name
- Jail source (Madison County or Limestone County)
- Document type classification
- Timestamp of the match

> **Gmail App Password vs. OAuth2:** This implementation uses Gmail App Passwords for simplicity. In a production environment, Gmail OAuth2 with refresh token rotation would be the preferred approach for better security and compliance with Google's API policies.

---

## Document Classification

The application uses an LLM to classify the document template on each upload.

**Example document types:**

- Booking Summary
- Court Docket Notice
- Crash Report
- Unknown Document

**LLM provider note:** This project uses the **Groq API**, which is fully OpenAI-compatible. Groq was chosen over the OpenAI API directly for lower latency and cost during development. The integration approach and prompting strategy are identical to what would be used with `openai` — swapping providers requires only a base URL and API key change.

**Handling uncertainty:** Classifications below a defined confidence threshold are defaulted to `Unknown Document` rather than guessing incorrectly.

---

## Secure Handling of Secrets

Security practices used in this project:

- All secrets stored in environment variables via `.env`
- `.env.example` included with placeholder values — never the real `.env`
- No hardcoded secrets anywhere in the codebase
- Sensitive values (API keys, tokens, passwords) excluded from logs
- `.env` listed in `.gitignore`

---

## Development Tools

This project was built with the assistance of the following AI development tools, as permitted by the implementation notes:

**GitHub Copilot** was used as an inline coding assistant within the editor. It accelerated development through real-time code suggestions and context-aware completions — particularly for Playwright scraper setup, PDF parsing logic, and Next.js API route scaffolding.

**ChatGPT** was used for higher-level reasoning and planning throughout the project: iterating on prompts for document classification, troubleshooting name normalization edge cases, planning the Gmail App Password flow, and drafting documentation structure.

Both tools served the role described in the implementation notes — agentic/dev tooling to accelerate development while keeping full architectural decisions and code review with the developer.

---

## Assumptions

- Jail roster websites remain publicly accessible during use
- Extracted PDF text contains recognizable, machine-readable names (not scanned images)
- Document templates follow broadly predictable patterns suitable for LLM classification
- Email notifications are configured using Gmail

---

## Limitations

- Name extraction uses heuristic methods and may miss uncommon name formats
- Fuzzy matching could be further tuned to reduce false positives
- Very large PDFs may increase processing time noticeably
- The scraper may require updates if either roster website changes its structure
- Gmail App Password approach is not suitable for multi-user or production deployment

---

## Future Improvements

Given more development time, the following enhancements would be prioritized:

- **Named Entity Recognition (NER)** for more accurate name detection
- **Advanced fuzzy matching** with configurable thresholds
- **PostgreSQL** instead of flat JSON files for scalable storage
- **User authentication and access control**
- **Scheduled scraper jobs** (cron-based or queue-based) for fresh roster data
- **OCR support** for scanned or image-based PDFs
- **Gmail OAuth2** to replace App Password authentication in production
- **OpenAI API** as a drop-in replacement for Groq if consistency with the spec is required

---

## License

This project was created as part of a technical evaluation exercise.
