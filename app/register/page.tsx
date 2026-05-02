// app/register/page.tsx

import { Suspense } from "react";

import { RegisterForm } from "@/components/RegisterForm";

export default function RegisterPage() {
  return <Suspense fallback={null}><RegisterForm /></Suspense>;
}
