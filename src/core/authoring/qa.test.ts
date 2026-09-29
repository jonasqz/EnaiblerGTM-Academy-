import { describe, expect, it } from "vitest";

import { csvRows, parseQaExport, qaPairs, qaText } from "@/core/authoring/qa";

describe("reading a live Q&A", () => {
  it("reads a tool's CSV export and keeps only questions and answers", () => {
    const csv = [
      "Question and Answer Report",
      "Topic,Webinar ID",
      '"Get paid on time",123 456 789',
      "",
      "#,Question,Asker Name,Asker Email,Answer(s)",
      '1,"How soon do I send the first reminder?",Jane Doe,jane@example.com,"Answered by Host: Three days after the due date."',
      '2,"Can I charge a fee, ""legally""?",Max,max@example.com,',
      "3,How soon do I send the first reminder?,Someone,,",
    ].join("\r\n");
    const pairs = parseQaExport(csv);
    expect(pairs).toEqual([
      {
        question: "How soon do I send the first reminder?",
        answer: "Three days after the due date.",
      },
      { question: 'Can I charge a fee, "legally"?', answer: null },
    ]);
    expect(JSON.stringify(pairs)).not.toMatch(/Jane|Max|example\.com/);
  });

  it("reads German headers and semicolons", () => {
    expect(
      parseQaExport("Frage;Antwort\nWann mahne ich?;Nach drei Tagen.\nDarf ich Zinsen nehmen?;"),
    ).toEqual([
      { question: "Wann mahne ich?", answer: "Nach drei Tagen." },
      { question: "Darf ich Zinsen nehmen?", answer: null },
    ]);
  });

  it("pairs marked text, across several lines", () => {
    const text = [
      "Q: How friendly should the first reminder be?",
      "A: Friendly and short.",
      "Name the invoice and the amount.",
      "",
      "Frage: Und wenn der Kunde nicht reagiert,",
      "was dann?",
      "",
      "Q: Who gets the reminder?",
      "A: Whoever approves payments, write to jane.doe@example.com.",
    ].join("\n");
    expect(parseQaExport(text)).toEqual([
      {
        question: "How friendly should the first reminder be?",
        answer: "Friendly and short. Name the invoice and the amount.",
      },
      { question: "Und wenn der Kunde nicht reagiert, was dann?", answer: null },
      {
        question: "Who gets the reminder?",
        answer: "Whoever approves payments, write to [e-mail].",
      },
    ]);
  });

  it("starts a question at every line that ends with a question mark in plain text", () => {
    const chat = [
      "10:02:33 From Jane Doe to Everyone: Is there a recording?",
      "10:04:10 From Host : Yes, we send it tomorrow.",
      "1. Do you have a template for the reminder?",
      "- What about clients abroad?",
      "Same rules within the EU.",
    ].join("\n");
    expect(parseQaExport(chat)).toEqual([
      { question: "Is there a recording?", answer: "Yes, we send it tomorrow." },
      { question: "Do you have a template for the reminder?", answer: null },
      { question: "What about clients abroad?", answer: "Same rules within the EU." },
    ]);
  });

  it("finds nothing in text without questions", () => {
    expect(parseQaExport("Thanks everyone, great session!\n\nSee you next week.")).toEqual([]);
  });

  it("stores the pairs as Markdown and reads them back", () => {
    const pairs = [
      { question: "## How soon?", answer: "Three days after.\n\nOr earlier." },
      { question: "Any fee?", answer: null },
    ];
    const text = qaText(pairs);
    expect(text).toBe("## How soon?\n\nThree days after.\n\nOr earlier.\n\n## Any fee?");
    expect(qaPairs(text)).toEqual([
      { question: "How soon?", answer: "Three days after.\n\nOr earlier." },
      { question: "Any fee?", answer: null },
    ]);
  });

  it("splits CSV cells with quotes, doubled quotes and line breaks", () => {
    expect(csvRows('a,"b, c","d ""e""\nf"\n1,2,3', ",")).toEqual([
      ["a", "b, c", 'd "e"\nf'],
      ["1", "2", "3"],
    ]);
  });
});
