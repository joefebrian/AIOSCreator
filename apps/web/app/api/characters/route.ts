import { NextResponse } from "next/server";
import { createCharacter, listCharacters, listCharactersLite, type CharacterSource } from "@/lib/characters";

export const runtime = "nodejs";

const SOURCES: CharacterSource[] = ["photo", "transform", "prompt"];

export async function GET(req: Request) {
  const lite = new URL(req.url).searchParams.get("lite") === "1";
  return NextResponse.json({ characters: lite ? listCharactersLite() : listCharacters() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    source?: string;
    sourcePrompt?: string;
  };
  const source = SOURCES.includes(body.source as CharacterSource)
    ? (body.source as CharacterSource)
    : "prompt";
  const row = createCharacter({
    name: body.name,
    source,
    sourcePrompt: body.sourcePrompt,
  });
  return NextResponse.json(row, { status: 201 });
}
