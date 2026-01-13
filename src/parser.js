// Improved question and choice extraction.
// - Question blocks: capture from "Q<number>." up to the next "Q<number>." or end
// - Choices: capture labels A. through H. and their text using non-greedy matches
const QUESTION_REGEX = /(Q\d+\.\s[\s\S]*?)(?=(?:Q\d+\.|$))/g;
const CHOICE_REGEX = /([A-H])\.\s([\s\S]*?)(?=(?:[A-H]\.\s)|$)/g;
// Common answer key formats within a question block
const ANSWER_LINE_REGEX = /(?:^|\n)\s*(?:Answer|Ans|Correct(?:\s*Answer)?|Key)\s*[:\-]?\s*([A-H])\b/i;
const CORRECT_MARK_REGEX = /\b(correct|true answer)\b|\*|\(\s*correct\s*\)|\[\s*correct\s*\]/i;

export function extractQuestions(text) {
  const questions = [];

  // Normalize newlines so regexes work predictably
  const clean = text.replace(/\r\n/g, "\n");

  let qm;
  while ((qm = QUESTION_REGEX.exec(clean)) !== null) {
    const raw = qm[1].trim();

    // Extract choices (and detect inline correct markers)
    const choices = [];
    let detectedAnswer = null;
    let cm;
    while ((cm = CHOICE_REGEX.exec(raw)) !== null) {
      const label = cm[1];
      const rawTxt = cm[2];
      // Strip explicit correctness hints from displayed text
      const cleanedTxt = rawTxt.replace(CORRECT_MARK_REGEX, "").trim().replace(/\s+/g, " ");
      choices.push(`${label}. ${cleanedTxt}`);
      if (!detectedAnswer && CORRECT_MARK_REGEX.test(rawTxt)) {
        detectedAnswer = label;
      }
    }

    // Stem is the part before the first choice if choices found
    let stem = raw;
    if (choices.length) {
      const firstChoice = choices[0];
      const idx = raw.indexOf(firstChoice);
      if (idx !== -1) {
        stem = raw.slice(0, idx).trim();
      } else {
        // fallback: remove all choices occurrences
        stem = raw.replace(CHOICE_REGEX, "").trim();
      }
    }

    // Look for explicit answer line if no inline marker found
    let answer = detectedAnswer;
    if (!answer) {
      const m = raw.match(ANSWER_LINE_REGEX);
      if (m) answer = m[1].toUpperCase();
    }

    questions.push({ stem, choices, raw, answer });
  }

  return questions;
}
