import { Suspense } from 'react';
import SignInClient from './signin-client';

export default function SignInPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '80vh', display: 'grid', placeItems: 'center' }} />}>
      <SignInClient />
    </Suspense>
  );
}
