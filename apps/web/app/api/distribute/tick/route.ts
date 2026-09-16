import { NextResponse } from "next/server";
import { duePublications } from "@/lib/publications";
import { publishNow } from "@/lib/social-publish";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST() {
  const due = duePublications();
  const results = [];
  for (const post of due) {
    results.push(await publishNow(post));
  }
  return NextResponse.json({ ran: results.length, results });
}
