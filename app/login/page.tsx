import { Suspense } from "react";

import { LoginForm } from "@/components/LoginForm";

export default function Page() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center px-4" />}>
      <div className="flex h-screen w-full items-center justify-center px-4">
        <LoginForm />
      </div>
    </Suspense>
  );
}
