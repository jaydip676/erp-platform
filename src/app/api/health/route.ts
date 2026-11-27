import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    app: process.env.APP_NAME ?? "VIAZ TYRES ERP",
  });
}