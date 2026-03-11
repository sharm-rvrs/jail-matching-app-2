import nodemailer from "nodemailer";
import type { MatchResult } from "./types";

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
  });
}

export async function sendMatchEmail(
  matches: MatchResult[],
  filename: string,
  documentType: string,
): Promise<void> {
  if (matches.length === 0) return;

  const isoTimestamp = new Date().toISOString();

  const displayTimestamp = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const matchRows = matches
    .map(
      (m) => `
      <li style="
        margin: 12px 0;
        padding: 14px 16px;
        background: #f8f9fa;
        border-left: 4px solid #228be6;
        border-radius: 6px;
      ">
        <strong style="font-size:15px;">${m.rosterName}</strong><br>
        <span style="color:#555;">Jail: ${m.jail}</span><br>
        <span style="color:#555;">Match Type: ${m.matchType}</span><br>
        <span style="color:#555;">Confidence: ${m.confidence}%</span>
      </li>`,
    )
    .join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#228be6;margin-bottom:4px;">Inmate Match Alert</h2>
      <hr style="border:none;border-top:1px solid #dee2e6;margin-bottom:16px;">

      <p><strong>PDF Processed:</strong> ${filename}</p>
      <p><strong>Document Type:</strong> ${documentType}</p>
      <p><strong>Time:</strong> ${displayTimestamp}</p>
      <p><strong>${matches.length} inmate match${matches.length === 1 ? "" : "es"} found in the roster:</strong></p>

      <ul style="list-style:none;padding:0;">
        ${matchRows}
      </ul>

      <p style="color:#999;font-size:12px;margin-top:24px;">
        This is an automated alert from your Jail Roster Matcher.
      </p>
    </div>
  `;

  try {
    const transporter = createTransporter();

    await transporter.sendMail({
      from: `"Jail Matcher" <${process.env.GMAIL_USER}>`,
      to: process.env.NOTIFY_EMAIL || process.env.GMAIL_USER,
      subject: `${matches.length} Inmate Match${matches.length === 1 ? "" : "es"} Found — ${filename}`,
      html,
    });

    console.log(`Email sent — ${matches.length} match(es) at ${isoTimestamp}`);
  } catch (error) {
    console.error("Failed to send match email:", error);
  }
}
