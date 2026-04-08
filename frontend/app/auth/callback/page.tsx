import { Suspense } from 'react';
import AuthCallbackClient from './auth-callback-client';

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<main><p>Signing you in…</p></main>}>
      <AuthCallbackClient />
    </Suspense>
  );
}
