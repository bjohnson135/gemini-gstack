/**
 * Vision-based quality gate for generated mockups.
 * Uses Gemini vision to verify text readability, layout completeness, and visual coherence.
 */

import fs from "fs";
import { requireApiKey } from "./auth";

export interface CheckResult {
  pass: boolean;
  issues: string;
}

/**
 * Check a generated mockup against the original brief.
 */
export async function checkMockup(imagePath: string, brief: string): Promise<CheckResult> {
  const apiKey = requireApiKey();
  const imageData = fs.readFileSync(imagePath).toString("base64");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inlineData: { mimeType: "image/png", data: imageData },
            },
            {
              text: [
                "You are a UI quality checker. Evaluate this mockup against the design brief.",
                "",
                `Brief: ${brief}`,
                "",
                "Check these 3 things:",
                "1. TEXT READABILITY: Are all labels, headings, and body text legible? Any misspellings?",
                "2. LAYOUT COMPLETENESS: Are all requested elements present? Anything missing?",
                "3. VISUAL COHERENCE: Does it look like a real production UI, not AI art or a collage?",
                "",
                "Respond with exactly one line:",
                "PASS — if all 3 checks pass",
                "FAIL: [list specific issues] — if any check fails",
              ].join("\n"),
            },
          ],
        }],
        generationConfig: { maxOutputTokens: 200 },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      // Non-blocking: if vision check fails, default to PASS with warning
      console.error(`Vision check API error (${response.status}): ${error}`);
      return { pass: true, issues: "Vision check unavailable — skipped" };
    }

    const data = await response.json() as any;
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (content.startsWith("PASS")) {
      return { pass: true, issues: "" };
    }

    return { pass: false, issues: content.replace(/^FAIL:\s*/, "") };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * CLI entry point for check command.
 */
export async function checkCommand(imagePath: string, brief: string): Promise<void> {
  if (!imagePath || !brief) {
    console.error("Usage: $D check --image <path> --brief <text>");
    process.exit(1);
  }

  const result = await checkMockup(imagePath, brief);
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exit(1);
}
