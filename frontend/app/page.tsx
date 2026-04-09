'use client';

import { AuthGate } from '@/components/auth-gate';
import { AuthControls } from '@/components/auth-controls';

function HomePageContent() {
  return (
    <main style={{ minHeight: '85vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <AuthControls />
        <h1>Recorder moved to Notes</h1>
        <p>The recording dock now lives on the Notes screen so you can record and review notes in one place.</p>
        <p>
          <a href="/notes">Open Notes recorder</a> · <a href="/settings">Settings</a>
        </p>
      </div>
    </main>
  );
}

export default function HomePage() {
  return (
    <AuthGate>
      <HomePageContent />
    </AuthGate>
  );
}
