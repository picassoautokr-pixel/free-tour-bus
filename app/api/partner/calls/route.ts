import { NextResponse } from "next/server";
import {
  resolveApprovedDriver,
  handlePartnerCallsGet,
} from "@/lib/partner-calls-handlers";

export const runtime = "nodejs";

export async function GET() {
  const driver = await resolveApprovedDriver();
  if (!driver.ok) {
    return NextResponse.json({ error: driver.error }, { status: driver.status });
  }

  const result = await handlePartnerCallsGet(driver);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
