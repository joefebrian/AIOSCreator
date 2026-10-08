import { NextResponse } from "next/server";
import { addExperiment, campaignBoard, createCampaign, removeCampaign, removeExperiment, sendCampaignSelection, updateCampaign } from "@/lib/campaigns";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(campaignBoard());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    name?: string;
    productIds?: string[];
    characterIds?: string[];
    market?: string;
    platform?: string;
    angle?: string;
    variable?: string;
    note?: string;
    experimentId?: string;
  };
  let savedId = "";
  try {
    if (body.action === "create") savedId = createCampaign(body).id;
    else if (body.action === "update") savedId = updateCampaign(String(body.id || ""), body).id;
    else if (body.action === "remove") removeCampaign(String(body.id || ""));
    else if (body.action === "add-experiment") addExperiment(String(body.id || ""), body.variable, body.note);
    else if (body.action === "remove-experiment") removeExperiment(String(body.experimentId || ""));
    else if (body.action === "send") {
      const sent = sendCampaignSelection(String(body.id || ""));
      return NextResponse.json({ ...campaignBoard(), savedId: body.id || "", sent: sent.sent });
    } else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed.";
    const status = message.endsWith("not found.") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
  return NextResponse.json({ ...campaignBoard(), savedId });
}
