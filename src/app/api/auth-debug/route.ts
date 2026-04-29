import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export async function GET() {
  const email = process.env.ADMIN_EMAIL ?? "NOT_SET";
  const hash = process.env.ADMIN_PASSWORD_HASH ?? "NOT_SET";
  const testPass = "Crm2026!";
  let valid = false;
  let err = "";
  try {
    valid = hash !== "NOT_SET" ? await bcrypt.compare(testPass, hash) : false;
  } catch (e) {
    err = String(e);
  }
  return NextResponse.json({
    emailSet: email !== "NOT_SET",
    emailValue: email,
    hashSet: hash !== "NOT_SET",
    hashLen: hash.length,
    hashPrefix: hash.slice(0, 7),
    passwordValid: valid,
    error: err,
  });
}
